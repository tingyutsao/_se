use anyhow::Result;
use reqwest::{Client, ClientBuilder, Proxy};
use std::time::Duration;

use crate::cli::Cli;

pub fn build_client(cli: &Cli) -> Result<Client> {
    let mut builder = ClientBuilder::new();

    if let Some(ct) = cli.connect_timeout {
        builder = builder.connect_timeout(Duration::from_secs_f64(ct));
    }
    if let Some(mt) = cli.max_time {
        builder = builder.timeout(Duration::from_secs_f64(mt));
    }

    if cli.location {
        builder = builder.redirect(reqwest::redirect::Policy::limited(cli.max_redirs as usize));
    } else {
        builder = builder.redirect(reqwest::redirect::Policy::none());
    }

    if let Some(ref proxy_str) = cli.proxy {
        let proxy = parse_proxy(proxy_str)?;
        builder = builder.proxy(proxy);
    }

    let client = builder
        .user_agent("rust-curl/0.1.0")
        .tcp_keepalive(Some(Duration::from_secs(60)))
        .danger_accept_invalid_certs(false)
        .build()?;

    Ok(client)
}

fn parse_proxy(s: &str) -> Result<Proxy> {
    let trimmed = s.trim();
    if trimmed.is_empty() {
        return Err(anyhow::anyhow!("Empty proxy string"));
    }
    let (scheme_part, rest) = if trimmed.contains("://") {
        let mut parts = trimmed.splitn(2, "://");
        let scheme = parts.next().unwrap_or("");
        let rest = parts.next().unwrap_or("");
        (Some(scheme.to_lowercase()), rest.to_string())
    } else {
        (None, trimmed.to_string())
    };
    let scheme = scheme_part.as_deref().unwrap_or("http");
    match scheme {
        "http" => Ok(Proxy::http(rest)?),
        "https" => Ok(Proxy::https(rest)?),
        "socks5" | "socks5h" => Ok(Proxy::all(rest)?),
        _ => Err(anyhow::anyhow!("Unsupported proxy scheme: {}", scheme)),
    }
}