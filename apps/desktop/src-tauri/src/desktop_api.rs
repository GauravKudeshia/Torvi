use reqwest::{Client, Method, StatusCode};
use serde::{Deserialize, Serialize};
use serde_json::{json, Value};
use std::collections::HashMap;
use std::sync::{
    atomic::{AtomicBool, Ordering},
    Arc, Mutex, OnceLock,
};
use std::time::Duration;
use tauri::Emitter;

const API_ORIGIN: &str = "https://interview-copilot.kudeshiakudeshia.chatgpt.site";
const KEYCHAIN_SERVICE: &str = "com.interviewcopilot.desktop.session.v2";
const KEYCHAIN_ACCOUNT: &str = "session";

fn client() -> Result<Client, String> {
    if rustls::crypto::CryptoProvider::get_default().is_none() {
        rustls::crypto::ring::default_provider()
            .install_default()
            .map_err(|_| "Secure networking could not initialize.".to_string())?;
    }
    Client::builder()
        .connect_timeout(Duration::from_secs(8))
        .timeout(Duration::from_secs(55))
        .user_agent("Torvi-Mac/0.7.0")
        .build()
        .map_err(|_| "Secure networking could not initialize.".to_string())
}

#[derive(Clone, Deserialize, Serialize)]
#[serde(rename_all = "camelCase")]
struct DesktopConnection {
    token: String,
    token_expires_at: u64,
    #[serde(default)]
    session_id: Option<String>,
    device_id: String,
    #[serde(default)]
    scope: Option<String>,
}

#[cfg(target_os = "macos")]
static CONNECTION_CACHE: Mutex<Option<DesktopConnection>> = Mutex::new(None);

static SUGGESTION_CANCELLATIONS: OnceLock<Mutex<HashMap<String, Arc<AtomicBool>>>> =
    OnceLock::new();

fn suggestion_cancellations() -> &'static Mutex<HashMap<String, Arc<AtomicBool>>> {
    SUGGESTION_CANCELLATIONS.get_or_init(|| Mutex::new(HashMap::new()))
}

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct DesktopConnectionSummary {
    token_expires_at: u64,
    session_id: Option<String>,
    device_id: String,
    scope: String,
}

impl From<&DesktopConnection> for DesktopConnectionSummary {
    fn from(connection: &DesktopConnection) -> Self {
        Self {
            token_expires_at: connection.token_expires_at,
            session_id: connection.session_id.clone(),
            device_id: connection.device_id.clone(),
            scope: connection.scope.clone().unwrap_or_else(|| "session".into()),
        }
    }
}

#[cfg(target_os = "macos")]
fn save_connection(connection: &DesktopConnection) -> Result<(), String> {
    let bytes = serde_json::to_vec(connection).map_err(|error| error.to_string())?;
    security_framework::passwords::set_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT, &bytes)
        .map_err(|error| format!("The Mac Keychain could not store the secure session: {error}"))?;
    *CONNECTION_CACHE
        .lock()
        .map_err(|_| "The secure session cache is unavailable.".to_string())? =
        Some(connection.clone());
    Ok(())
}

#[cfg(target_os = "macos")]
fn load_connection() -> Result<DesktopConnection, String> {
    if let Some(connection) = CONNECTION_CACHE
        .lock()
        .map_err(|_| "The secure session cache is unavailable.".to_string())?
        .clone()
    {
        return Ok(connection);
    }
    let bytes =
        security_framework::passwords::get_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
            .map_err(|_| {
                "No connected interview was found. Connect from the web session first.".to_string()
            })?;
    let connection: DesktopConnection = serde_json::from_slice(&bytes)
        .map_err(|_| "The saved desktop session is invalid. Connect it again.".to_string())?;
    *CONNECTION_CACHE
        .lock()
        .map_err(|_| "The secure session cache is unavailable.".to_string())? =
        Some(connection.clone());
    Ok(connection)
}

#[cfg(target_os = "macos")]
fn remove_connection() -> Result<(), String> {
    if let Ok(mut cache) = CONNECTION_CACHE.lock() {
        *cache = None;
    }
    match security_framework::passwords::delete_generic_password(KEYCHAIN_SERVICE, KEYCHAIN_ACCOUNT)
    {
        Ok(()) => Ok(()),
        Err(_) => Ok(()),
    }
}

#[cfg(not(target_os = "macos"))]
fn save_connection(_connection: &DesktopConnection) -> Result<(), String> {
    Err("Secure desktop credential storage is not implemented for this platform yet.".into())
}

#[cfg(not(target_os = "macos"))]
fn load_connection() -> Result<DesktopConnection, String> {
    Err("No connected interview was found.".into())
}

#[cfg(not(target_os = "macos"))]
fn remove_connection() -> Result<(), String> {
    Ok(())
}

async fn response_value(response: reqwest::Response) -> Result<Value, String> {
    let status = response.status();
    let value = response
        .json::<Value>()
        .await
        .map_err(|_| "The service returned an unreadable response.".to_string())?;
    if status.is_success() {
        return Ok(value);
    }
    let message = value
        .pointer("/error/message")
        .and_then(Value::as_str)
        .unwrap_or("The request could not be completed.");
    Err(message.to_string())
}

async fn session_request(
    connection: &DesktopConnection,
    method: Method,
    path: &str,
    body: Option<Value>,
) -> Result<reqwest::Response, String> {
    if connection.scope.as_deref() != Some("account") {
        let session_id = connection
            .session_id
            .as_deref()
            .ok_or_else(|| "No active interview is selected.".to_string())?;
        let expected_prefix = format!("/api/v1/sessions/{session_id}");
        if !(path == expected_prefix || path.starts_with(&format!("{expected_prefix}/"))) {
            return Err(
                "The desktop app blocked a request outside the connected interview session.".into(),
            );
        }
    }
    let mut request = client()?
        .request(method, format!("{API_ORIGIN}{path}"))
        .bearer_auth(&connection.token)
        .header("accept", "application/json, text/event-stream");
    if let Some(value) = body {
        request = request.json(&value);
    }
    request.send().await.map_err(|_| {
        "Could not reach Torvi. Check your connection and retry.".to_string()
    })
}

fn active_session_id(connection: &DesktopConnection) -> Result<&str, String> {
    connection
        .session_id
        .as_deref()
        .ok_or_else(|| "Prepare or select an interview in the Mac app first.".into())
}

fn account_path_allowed(path: &str) -> bool {
    const PREFIXES: [&str; 14] = [
        "/api/v1/profile",
        "/api/v1/job-targets",
        "/api/v1/documents",
        "/api/v1/memory",
        "/api/v1/reports",
        "/api/v1/sessions",
        "/api/v1/preflight",
        "/api/v1/feature-flags",
        "/api/v1/interview-processes",
        "/api/v1/entitlements",
        "/api/v1/job-applications",
        "/api/v1/tools",
        "/api/v1/providers",
        "/api/v1/telemetry",
    ];
    PREFIXES
        .iter()
        .any(|prefix| path == *prefix || path.starts_with(&format!("{prefix}/")))
}

#[tauri::command]
pub async fn begin_desktop_authorization(
    device_name: String,
    app_version: String,
) -> Result<Value, String> {
    let response = client()?
        .post(format!("{API_ORIGIN}/api/v1/desktop/authorize/start"))
        .json(&json!({ "deviceName": device_name, "appVersion": app_version }))
        .send()
        .await
        .map_err(|_| {
            "Could not start secure Mac sign-in. Check your connection and retry.".to_string()
        })?;
    response_value(response).await
}

#[tauri::command]
pub async fn poll_desktop_authorization(device_code: String) -> Result<Value, String> {
    let response = client()?
        .post(format!("{API_ORIGIN}/api/v1/desktop/authorize/poll"))
        .json(&json!({ "deviceCode": device_code }))
        .send()
        .await
        .map_err(|_| {
            "Could not finish secure Mac sign-in. Check your connection and retry.".to_string()
        })?;
    let status = response.status();
    let value = response_value(response).await?;
    if status == StatusCode::ACCEPTED {
        return Ok(value);
    }
    if value.get("status").and_then(Value::as_str) == Some("approved") {
        let connection = DesktopConnection {
            token: value
                .get("token")
                .and_then(Value::as_str)
                .ok_or_else(|| "The service omitted the Mac credential.".to_string())?
                .to_string(),
            token_expires_at: value
                .get("tokenExpiresAt")
                .and_then(Value::as_u64)
                .ok_or_else(|| "The service omitted the credential expiry.".to_string())?,
            session_id: None,
            device_id: value
                .get("deviceId")
                .and_then(Value::as_str)
                .ok_or_else(|| "The service omitted the device identity.".to_string())?
                .to_string(),
            scope: Some("account".into()),
        };
        save_connection(&connection)?;
        return Ok(
            json!({ "status": "approved", "account": DesktopConnectionSummary::from(&connection) }),
        );
    }
    Ok(value)
}

#[tauri::command]
pub fn desktop_account_status() -> Result<Option<DesktopConnectionSummary>, String> {
    let connection = match load_connection() {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    if connection.token_expires_at <= crate::unix_time_ms() {
        let _ = remove_connection();
        return Ok(None);
    }
    Ok(Some((&connection).into()))
}

#[tauri::command]
pub async fn desktop_api_request(
    method: String,
    path: String,
    body: Option<Value>,
) -> Result<Value, String> {
    let connection = load_connection()?;
    if connection.scope.as_deref() != Some("account") {
        return Err("Sign in from the Mac app to use preparation and account features.".into());
    }
    if !account_path_allowed(&path) {
        return Err("The Mac app blocked this account action.".into());
    }
    let method = match method.as_str() {
        "GET" => Method::GET,
        "POST" => Method::POST,
        "PATCH" => Method::PATCH,
        "DELETE" => Method::DELETE,
        _ => return Err("Unsupported Mac API method.".into()),
    };
    response_value(session_request(&connection, method, &path, body).await?).await
}

#[tauri::command]
pub async fn desktop_upload_document(
    file_name: String,
    content_type: String,
    kind: String,
    bytes: Vec<u8>,
) -> Result<Value, String> {
    let connection = load_connection()?;
    if connection.scope.as_deref() != Some("account") {
        return Err("Sign in from the Mac app before uploading documents.".into());
    }
    if bytes.is_empty() || bytes.len() > 8 * 1024 * 1024 {
        return Err("Documents must be between 1 byte and 8 MB.".into());
    }
    if ![
        "application/pdf",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        "text/plain",
    ]
    .contains(&content_type.as_str())
    {
        return Err("Use a PDF, DOCX, or TXT document.".into());
    }
    if !["resume", "job-description", "other"].contains(&kind.as_str()) {
        return Err("Invalid document type.".into());
    }
    let ticket = response_value(session_request(&connection, Method::POST, "/api/v1/documents/upload-url", Some(json!({
        "fileName": file_name, "contentType": content_type, "sizeBytes": bytes.len(), "kind": kind,
    }))).await?).await?;
    let upload_url = ticket
        .get("uploadUrl")
        .and_then(Value::as_str)
        .ok_or_else(|| "The service omitted the upload URL.".to_string())?;
    let response = client()?
        .put(upload_url)
        .header("content-type", content_type)
        .body(bytes)
        .send()
        .await
        .map_err(|_| {
            "The document upload was interrupted. Retry it from the Mac app.".to_string()
        })?;
    response_value(response).await
}

#[tauri::command]
pub async fn desktop_start_session(payload: Value) -> Result<Value, String> {
    let mut connection = load_connection()?;
    if connection.scope.as_deref() != Some("account") {
        return Err("Sign in from the Mac app before preparing an interview.".into());
    }
    let created = response_value(
        session_request(&connection, Method::POST, "/api/v1/sessions", Some(payload)).await?,
    )
    .await?;
    let session_id = created
        .get("id")
        .and_then(Value::as_str)
        .ok_or_else(|| "The service omitted the new session identity.".to_string())?
        .to_string();
    connection.session_id = Some(session_id.clone());
    save_connection(&connection)?;
    let path = format!("/api/v1/sessions/{session_id}");
    response_value(session_request(&connection, Method::GET, &path, None).await?).await
}

#[tauri::command]
pub async fn connect_desktop(
    code: String,
    device_name: String,
    app_version: String,
) -> Result<DesktopConnectionSummary, String> {
    let response = client()?
        .post(format!("{API_ORIGIN}/api/v1/desktop/exchange"))
        .json(&json!({ "code": code, "deviceName": device_name, "appVersion": app_version }))
        .send()
        .await
        .map_err(|_| {
            "Could not reach Torvi. Check your connection and retry.".to_string()
        })?;
    let value = response_value(response).await?;
    let connection: DesktopConnection = serde_json::from_value(value)
        .map_err(|_| "The service returned an invalid desktop connection.".to_string())?;
    save_connection(&connection)?;
    Ok((&connection).into())
}

#[tauri::command]
pub async fn restore_desktop_connection() -> Result<Option<Value>, String> {
    let connection = match load_connection() {
        Ok(value) => value,
        Err(_) => return Ok(None),
    };
    if connection.token_expires_at <= crate::unix_time_ms() {
        let _ = remove_connection();
        return Ok(None);
    }
    let session_id = match connection.session_id.as_deref() {
        Some(value) => value,
        None => return Ok(None),
    };
    let path = format!("/api/v1/sessions/{session_id}");
    match session_request(&connection, Method::GET, &path, None).await {
        Ok(response) if response.status().is_success() => Ok(Some(response_value(response).await?)),
        Ok(response)
            if response.status() == StatusCode::UNAUTHORIZED
                || response.status() == StatusCode::FORBIDDEN =>
        {
            let _ = remove_connection();
            Ok(None)
        }
        Ok(response) => Err(response_value(response)
            .await
            .err()
            .unwrap_or_else(|| "The interview session is unavailable.".into())),
        Err(error) => Err(error),
    }
}

#[tauri::command]
pub async fn desktop_session_context() -> Result<Value, String> {
    let connection = load_connection()?;
    let path = format!("/api/v1/sessions/{}", active_session_id(&connection)?);
    response_value(session_request(&connection, Method::GET, &path, None).await?).await
}

#[tauri::command]
pub async fn desktop_realtime(
    channel: String,
    client_turn_detection: bool,
) -> Result<Value, String> {
    if channel != "interviewer" && channel != "candidate" {
        return Err("Invalid audio channel.".into());
    }
    let connection = load_connection()?;
    let path = format!(
        "/api/v1/sessions/{}/realtime",
        active_session_id(&connection)?
    );
    response_value(
        session_request(
            &connection,
            Method::POST,
            &path,
            Some(json!({
                "channel": channel,
                "clientTurnDetection": client_turn_detection
            })),
        )
        .await?,
    )
    .await
}

#[tauri::command]
pub async fn desktop_suggest(
    app: tauri::AppHandle,
    request_id: String,
    payload: Value,
) -> Result<(), String> {
    let connection = load_connection()?;
    let path = format!(
        "/api/v1/sessions/{}/suggestions",
        active_session_id(&connection)?
    );
    let cancellation = Arc::new(AtomicBool::new(false));
    suggestion_cancellations()
        .lock()
        .map_err(|_| "The suggestion controller is unavailable.".to_string())?
        .insert(request_id.clone(), cancellation.clone());
    let result = async {
        let mut response = session_request(&connection, Method::POST, &path, Some(payload)).await?;
        if !response.status().is_success() {
            return Err(response_value(response)
                .await
                .err()
                .unwrap_or_else(|| "The coach is unavailable.".into()));
        }
        while let Some(chunk) = response
            .chunk()
            .await
            .map_err(|_| "The coach returned an unreadable suggestion stream.".to_string())?
        {
            if cancellation.load(Ordering::SeqCst) {
                break;
            }
            app.emit(
                "desktop-suggestion-chunk",
                json!({ "requestId": request_id, "bytes": chunk.to_vec() }),
            )
            .map_err(|error| error.to_string())?;
        }
        Ok(())
    }
    .await;
    suggestion_cancellations()
        .lock()
        .map_err(|_| "The suggestion controller is unavailable.".to_string())?
        .remove(&request_id);
    result
}

#[tauri::command]
pub fn cancel_desktop_suggestion(request_id: String) -> Result<(), String> {
    if let Some(cancellation) = suggestion_cancellations()
        .lock()
        .map_err(|_| "The suggestion controller is unavailable.".to_string())?
        .get(&request_id)
    {
        cancellation.store(true, Ordering::SeqCst);
    }
    Ok(())
}

#[tauri::command]
pub async fn desktop_screen_context(bytes: Vec<u8>, content_type: String) -> Result<Value, String> {
    if bytes.is_empty() || bytes.len() > 5 * 1024 * 1024 {
        return Err("Screen context must be between 1 byte and 5 MB.".into());
    }
    if !["image/png", "image/jpeg", "image/webp"].contains(&content_type.as_str()) {
        return Err("Use a PNG, JPEG, or WebP image.".into());
    }
    let connection = load_connection()?;
    let session_id = active_session_id(&connection)?.to_string();
    let boundary = format!(
        "InterviewCopilotBoundary{}",
        std::time::SystemTime::now()
            .duration_since(std::time::UNIX_EPOCH)
            .map_err(|_| "The screen image could not be prepared.".to_string())?
            .as_nanos()
    );
    let mut body = format!(
        "--{boundary}\r\nContent-Disposition: form-data; name=\"image\"; filename=\"screen-context\"\r\nContent-Type: {content_type}\r\n\r\n"
    )
    .into_bytes();
    body.extend_from_slice(&bytes);
    body.extend_from_slice(format!("\r\n--{boundary}--\r\n").as_bytes());
    let response = client()?
        .post(format!(
            "{API_ORIGIN}/api/v1/sessions/{session_id}/screen-context"
        ))
        .bearer_auth(&connection.token)
        .header("accept", "application/json")
        .header(
            reqwest::header::CONTENT_TYPE,
            format!("multipart/form-data; boundary={boundary}"),
        )
        .body(body)
        .send()
        .await
        .map_err(|_| {
            "Screen analysis could not reach Torvi. Check your connection and retry."
                .to_string()
        })?;
    response_value(response).await
}

#[tauri::command]
pub async fn desktop_finish(
    choice: String,
    live_seconds: u32,
    segments: Value,
) -> Result<Value, String> {
    if choice != "save" && choice != "discard" {
        return Err("Invalid retention choice.".into());
    }
    let mut connection = load_connection()?;
    let session_id = active_session_id(&connection)?.to_string();
    let end_path = format!("/api/v1/sessions/{session_id}/end");
    let end_response = session_request(
        &connection,
        Method::POST,
        &end_path,
        Some(json!({ "liveSeconds": live_seconds })),
    )
    .await?;
    response_value(end_response).await?;
    let finish_path = format!("/api/v1/sessions/{session_id}/{choice}");
    let body = if choice == "save" {
        Some(json!({ "segments": segments }))
    } else {
        None
    };
    let result =
        response_value(session_request(&connection, Method::POST, &finish_path, body).await?)
            .await?;
    if connection.scope.as_deref() == Some("account") {
        connection.session_id = None;
        save_connection(&connection)?;
    } else {
        remove_connection()?;
    }
    Ok(result)
}

#[tauri::command]
pub fn disconnect_desktop() -> Result<(), String> {
    remove_connection()
}
