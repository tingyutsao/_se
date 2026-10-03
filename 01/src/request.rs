use anyhow::Result;
use reqwest::header::{HeaderMap, HeaderName, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use reqwest::multipart::{Form, Part};
use std::path::Path;
use tokio::fs::File;
use tokio::io::AsyncReadExt;

use crate::cli::Cli;

#[derive(Debug)]
pub enum PreparedBody {
    Bytes(Vec<u8>),
    Form(Form),
}

pub fn parse_headers(headers: &[String]) -> Result<HeaderMap> {
    let mut header_map = HeaderMap::new();
    for h in headers {
        if let Some(colon_idx) = h.find(':') {
            let name = &h[..colon_idx].trim();
            let value = &h[colon_idx + 1..].trim();
            if name.is_empty() {
                continue;
            }
            let key = HeaderName::from_bytes(name.as_bytes())
                .map_err(|e| anyhow::anyhow!("Invalid header name '{}': {}", name, e))?;
            let val = HeaderValue::from_str(value)
                .map_err(|e| anyhow::anyhow!("Invalid header value for '{}': {}", name, e))?;
            header_map.insert(key, val);
        } else {
            return Err(anyhow::anyhow!(
                "Invalid header format: '{}'. Expected 'Name: Value'",
                h
            ));
        }
    }
    Ok(header_map)
}

fn parse_basic_auth(creds: &str) -> Result<(String, Option<String>)> {
    if let Some(colon_idx) = creds.find(':') {
        let user = creds[..colon_idx].to_string();
        let pass = creds[colon_idx + 1..].to_string();
        Ok((user, if pass.is_empty() { None } else { Some(pass) }))
    } else {
        Ok((creds.to_string(), None))
    }
}

pub fn build_basic_auth_header(creds: &str) -> Result<HeaderValue> {
    let (user, pass) = parse_basic_auth(creds)?;
    use base64::prelude::*;
    let encoded = BASE64_STANDARD.encode(format!("{}:{}", user, pass.unwrap_or_default()));
    let val = HeaderValue::from_str(&format!("Basic {}", encoded))
        .map_err(|e| anyhow::anyhow!("Failed to build auth header: {}", e))?;
    Ok(val)
}

pub async fn build_multipart_form(form_args: &[String]) -> Result<Form> {
    let mut form = Form::new();
    for f in form_args {
        if let Some(eq_idx) = f.find('=') {
            let key = f[..eq_idx].trim().to_string();
            let value_str = &f[eq_idx + 1..];
            if let Some(path_str) = value_str.strip_prefix('@') {
                let path = Path::new(path_str);
                if !path.exists() {
                    return Err(anyhow::anyhow!("File not found: {}", path_str));
                }
                let mut file = File::open(path).await?;
                let mut buffer = Vec::new();
                file.read_to_end(&mut buffer).await?;
                let file_name = path
                    .file_name()
                    .and_then(|n| n.to_str())
                    .unwrap_or(path_str)
                    .to_string();
                let part = Part::bytes(buffer).file_name(file_name);
                form = form.part(key, part);
            } else {
                form = form.text(key, value_str.to_string());
            }
        } else {
            return Err(anyhow::anyhow!(
                "Invalid form format: '{}'. Expected 'KEY=VALUE' or 'KEY=@FILE'",
                f
            ));
        }
    }
    Ok(form)
}

pub async fn prepare_request_body(cli: &Cli) -> Result<Option<PreparedBody>> {
    if !cli.form.is_empty() {
        let form = build_multipart_form(&cli.form).await?;
        return Ok(Some(PreparedBody::Form(form)));
    }
    if let Some(ref bin_path) = cli.data_binary {
        let mut file = File::open(bin_path).await?;
        let mut buffer = Vec::new();
        file.read_to_end(&mut buffer).await?;
        return Ok(Some(PreparedBody::Bytes(buffer)));
    }
    if let Some(ref data) = cli.data {
        return Ok(Some(PreparedBody::Bytes(data.as_bytes().to_vec())));
    }
    Ok(None)
}

pub fn apply_auth_header(header_map: &mut HeaderMap, creds: &str) -> Result<()> {
    let auth_val = build_basic_auth_header(creds)?;
    header_map.insert(AUTHORIZATION, auth_val);
    Ok(())
}

pub fn maybe_set_content_type_for_form_or_data(
    header_map: &mut HeaderMap,
    cli: &Cli,
) -> Result<()> {
    if !cli.form.is_empty() {
        return Ok(());
    }
    if (cli.data.is_some() || cli.data_binary.is_some())
        && header_map.get(CONTENT_TYPE).is_none() {
            header_map.insert(
                CONTENT_TYPE,
                HeaderValue::from_static("application/x-www-form-urlencoded"),
            );
        }
    Ok(())
}