use clap::{Parser, ValueEnum};
use std::path::PathBuf;
use url::Url;

#[derive(Debug, Clone, ValueEnum)]
#[allow(clippy::upper_case_acronyms)]
#[value(rename_all = "lowercase")]
pub enum Method {
    GET,
    POST,
    PUT,
    DELETE,
    HEAD,
    OPTIONS,
    PATCH,
}

#[derive(Debug, Parser)]
#[command(name = "rust-curl", about = "A lightweight, modular curl-like HTTP client", version)]
pub struct Cli {
    /// URL to fetch
    pub url: String,

    /// HTTP method to use
    #[arg(short = 'X', long = "request", value_enum, default_value_t = Method::GET, ignore_case = true)]
    pub method: Method,

    /// Custom header to pass to server
    #[arg(short = 'H', long = "header", value_name = "HEADER")]
    pub headers: Vec<String>,

    /// HTTP POST data
    #[arg(short = 'd', long = "data", value_name = "DATA")]
    pub data: Option<String>,

    /// HTTP POST data from file
    #[arg(long = "data-binary", value_name = "@FILE")]
    pub data_binary: Option<PathBuf>,

    /// Include protocol response headers in output
    #[arg(short = 'i', long = "include")]
    pub include: bool,

    /// Write output to <file> instead of stdout
    #[arg(short = 'o', long = "output", value_name = "FILE")]
    pub output: Option<PathBuf>,

    /// Write output to a file named as the remote file
    #[arg(short = 'O', long = "remote-name")]
    pub remote_name: bool,

    /// Follow HTTP redirects
    #[arg(short = 'L', long = "location")]
    pub location: bool,

    /// Maximum number of redirects to follow
    #[arg(long = "max-redirs", value_name = "NUM", default_value_t = 10)]
    pub max_redirs: u32,

    /// Maximum time allowed for the transfer
    #[arg(short = 'm', long = "max-time", value_name = "SECONDS")]
    pub max_time: Option<f64>,

    /// Maximum time allowed for connection
    #[arg(long = "connect-timeout", value_name = "SECONDS")]
    pub connect_timeout: Option<f64>,

    /// User name and password for basic auth
    #[arg(short = 'u', long = "user", value_name = "USER:PASS")]
    pub user: Option<String>,

    /// Use proxy
    #[arg(short = 'x', long = "proxy", value_name = "[PROTOCOL://]HOST:PORT")]
    pub proxy: Option<String>,

    /// Silent mode
    #[arg(short = 's', long = "silent")]
    pub silent: bool,

    /// Verbose mode
    #[arg(short = 'v', long = "verbose")]
    pub verbose: bool,

    /// Write-out format
    #[arg(short = 'w', long = "write-out", value_name = "FORMAT")]
    pub write_out: Option<String>,

    /// Multipart form data
    #[arg(short = 'F', long = "form", value_name = "KEY=VALUE|@FILE")]
    pub form: Vec<String>,
}

impl Cli {
    pub fn get_method_string(&self) -> String {
        match self.method {
            Method::GET => "GET".to_string(),
            Method::POST => "POST".to_string(),
            Method::PUT => "PUT".to_string(),
            Method::DELETE => "DELETE".to_string(),
            Method::HEAD => "HEAD".to_string(),
            Method::OPTIONS => "OPTIONS".to_string(),
            Method::PATCH => "PATCH".to_string(),
        }
    }

    pub fn validate_url(&self) -> Result<Url, anyhow::Error> {
        let url_str = if !self.url.contains("://") {
            format!("http://{}", self.url)
        } else {
            self.url.clone()
        };
        Url::parse(&url_str).map_err(|e| anyhow::anyhow!("Invalid URL '{}': {}", self.url, e))
    }
}