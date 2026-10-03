use indicatif::{ProgressBar, ProgressStyle};
use std::time::Duration;

#[derive(Clone)]
#[allow(dead_code)]
pub struct ProgressConfig {
    pub show_progress: bool,
}

pub fn new_progress_bar(total: Option<u64>, show: bool) -> ProgressBar {
    if !show {
        return ProgressBar::hidden();
    }
    let pb = match total {
        Some(t) => ProgressBar::new(t),
        None => ProgressBar::new_spinner(),
    };
    pb.set_style(
        ProgressStyle::with_template("{spinner} {bytes}/{total_bytes} ({eta}) {bytes_per_sec}")
            .unwrap()
            .progress_chars("█▓▒░"),
    );
    pb.enable_steady_tick(Duration::from_millis(100));
    pb
}

pub fn progress_enabled(silent: bool) -> bool {
    !silent && atty::is(atty::Stream::Stdout)
}

#[derive(Default, Debug)]
pub struct WriteOutMetrics {
    pub time_total: f64,
    pub time_namelookup: f64,
    pub time_connect: f64,
    pub time_appconnect: f64,
    pub time_pretransfer: f64,
    pub time_redirect: f64,
    pub time_starttransfer: f64,
    pub http_code: u16,
    pub speed_download: f64,
    pub size_download: u64,
    pub url_effective: Option<String>,
}

pub fn format_write_out(fmt: &str, m: &WriteOutMetrics) -> String {
    fmt.replace("%{http_code}", &m.http_code.to_string())
        .replace("%{response_code}", &m.http_code.to_string())
        .replace("%{time_total}", format!("{:.6}", m.time_total).as_str())
        .replace("%{time_namelookup}", format!("{:.6}", m.time_namelookup).as_str())
        .replace("%{time_connect}", format!("{:.6}", m.time_connect).as_str())
        .replace("%{time_appconnect}", format!("{:.6}", m.time_appconnect).as_str())
        .replace("%{time_pretransfer}", format!("{:.6}", m.time_pretransfer).as_str())
        .replace("%{time_redirect}", format!("{:.6}", m.time_redirect).as_str())
        .replace("%{time_starttransfer}", format!("{:.6}", m.time_starttransfer).as_str())
        .replace("%{speed_download}", format!("{:.6}", m.speed_download).as_str())
        .replace("%{size_download}", &m.size_download.to_string())
        .replace(
            "%{url_effective}",
            m.url_effective.as_deref().unwrap_or(""),
        )
        .replace("\\n", "\n")
        .replace("\\r", "\r")
        .replace("\\t", "\t")
}