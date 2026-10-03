mod cli;
mod client;
mod progress;
mod request;
mod response;

use anyhow::Result;
use clap::Parser;
use futures_util::StreamExt;
use std::io::{self, Write};
use std::time::Instant;

use crate::cli::Cli;
use crate::client::build_client;
use crate::progress::{format_write_out, new_progress_bar, progress_enabled, WriteOutMetrics};
use crate::request::{apply_auth_header, maybe_set_content_type_for_form_or_data, parse_headers, prepare_request_body};
use crate::response::{colorize_status, print_response_headers, write_output};

#[tokio::main]
async fn main() {
    if let Err(e) = run().await {
        eprintln!("Error: {}", e);
        std::process::exit(1);
    }
    std::process::exit(0);
}

async fn run() -> Result<()> {
    let cli = Cli::parse();
    let url = cli.validate_url()?;

    if !cli.silent && cli.verbose {
        eprintln!("* Trying to connect to {}", url);
    }

    let mut header_map = parse_headers(&cli.headers)?;
    if let Some(ref creds) = cli.user {
        apply_auth_header(&mut header_map, creds)?;
    }
    maybe_set_content_type_for_form_or_data(&mut header_map, &cli)?;

    let body = prepare_request_body(&cli).await?;
    let client = build_client(&cli)?;

    let req_start = Instant::now();
    let mut req_builder = client
        .request(reqwest::Method::from_bytes(cli.get_method_string().as_bytes())?, url.clone())
        .headers(header_map);

    match body {
        Some(crate::request::PreparedBody::Bytes(b)) => {
            req_builder = req_builder.body(b);
        }
        Some(crate::request::PreparedBody::Form(f)) => {
            req_builder = req_builder.multipart(f);
        }
        None => {}
    }

    // method already set above; HEAD handled by enum mapping if needed


    if !cli.silent && cli.verbose {
        eprintln!("> {} {}", cli.get_method_string(), url);
        // headers already printed conceptually via CLI headers; skip deep inspection

        eprintln!(">");
    }

    let resp = req_builder.send().await?;
    let time_total = req_start.elapsed().as_secs_f64();

    if !cli.silent && cli.verbose {
        eprintln!("< HTTP/{:?}", resp.version());
        eprintln!("< {}", colorize_status(resp.status()));        for (k, v) in resp.headers().iter() {
            eprintln!("< {}: {}", k, v.to_str().unwrap_or("[binary]"));
        }
        eprintln!("<");
    }

    print_response_headers(&resp.version(), resp.status(), resp.headers(), cli.include)?;

    let content_length = resp.content_length();
    let show_progress = progress_enabled(cli.silent);
    let pb = new_progress_bar(content_length, show_progress);
    let status_code = resp.status().as_u16();
    let mut stream = resp.bytes_stream();
    let mut collected: Vec<u8> = Vec::with_capacity(content_length.unwrap_or(0) as usize);
    let mut bytes_downloaded: u64 = 0;
    while let Some(chunk) = stream.next().await {
        let chunk = chunk?;
        let len = chunk.len() as u64;
        bytes_downloaded += len;
        pb.inc(len);
        collected.extend_from_slice(&chunk);
    }
    pb.finish_and_clear();

    let remote_filename = url
        .path_segments()
        .and_then(|mut segments| segments.next_back())
        .filter(|name| !name.is_empty());
    write_output(&collected, &cli, remote_filename)?;

    if let Some(ref fmt) = cli.write_out {
        let m = WriteOutMetrics {
            time_total,
            time_namelookup: 0.0,
            time_connect: 0.0,
            time_appconnect: 0.0,
            time_pretransfer: 0.0,
            time_redirect: 0.0,
            time_starttransfer: 0.0,
            http_code: status_code,
            speed_download: if time_total > 0.0 { bytes_downloaded as f64 / time_total } else { 0.0 },
            size_download: bytes_downloaded,
            url_effective: Some(url.to_string()),
        };
        let out = format_write_out(fmt, &m);
        if !out.is_empty() {
            let _ = io::stdout().write_all(out.as_bytes());
            let _ = io::stdout().write_all(b"\n");
        }
    }

    Ok(())
}