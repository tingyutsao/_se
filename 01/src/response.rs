use anyhow::Result;
use colored::*;
use reqwest::header::HeaderMap;
use std::fs::File;
use std::io::{self, Write};

use crate::cli::Cli;

pub fn colorize_status(status: reqwest::StatusCode) -> String {
    let code = status.as_u16();
    let text = format!("{} {}", code, status.canonical_reason().unwrap_or(""));
    if (200..300).contains(&code) {
        text.green().to_string()
    } else if (300..400).contains(&code) {
        text.cyan().to_string()
    } else if (400..500).contains(&code) {
        text.yellow().to_string()
    } else if code >= 500 {
        text.red().to_string()
    } else {
        text.white().to_string()
    }
}

pub fn print_response_headers(
    version: &reqwest::Version,
    status: reqwest::StatusCode,
    headers: &HeaderMap,
    include: bool,
) -> Result<()> {
    if !include {
        return Ok(());
    }
    let version_str = match *version {
        reqwest::Version::HTTP_09 => "HTTP/0.9",
        reqwest::Version::HTTP_10 => "HTTP/1.0",
        reqwest::Version::HTTP_11 => "HTTP/1.1",
        reqwest::Version::HTTP_2 => "HTTP/2",
        reqwest::Version::HTTP_3 => "HTTP/3",
        _ => "HTTP/1.1",
    };
    println!("{} {}", version_str, colorize_status(status));
    for (name, value) in headers.iter() {
        let value_str = value.to_str().unwrap_or("[binary]");
        println!("{}: {}", name.as_str().bold(), value_str);
    }
    println!();
    Ok(())
}

pub fn write_output(
    body: &[u8],
    cli: &Cli,
    remote_filename: Option<&str>,
) -> Result<()> {
    if cli.remote_name {
        if let Some(name) = remote_filename {
            let mut f = File::create(name)?;
            f.write_all(body)?;
            return Ok(());
        }
    }
    if let Some(ref out_path) = cli.output {
        let mut f = File::create(out_path)?;
        f.write_all(body)?;
        return Ok(());
    }
    io::stdout().write_all(body)?;
    Ok(())
}