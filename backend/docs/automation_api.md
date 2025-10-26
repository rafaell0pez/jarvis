# Browser Automation API Documentation

This document describes the browser automation API endpoints for using Patchright to automate image uploads to Lenso.ai.

## Overview

The browser automation API provides endpoints for:
- Uploading images to Lenso.ai for reverse image search
- Managing persistent browser sessions for multiple operations
- Extracting search results and image URLs

## Base URL

```
http://localhost:8000/api/v1/automation
```

## Endpoints

### 1. Upload Image by File Path

Upload an image to Lenso.ai using a local file path.

**Endpoint:** `POST /upload-image`

**Request Body:**
```json
{
  "image_path": "/path/to/image.jpg",
  "headless": true,
  "wait_time": 10
}
```

**Parameters:**
- `image_path` (string, required): Path to the image file
- `headless` (boolean, optional): Run browser in headless mode (default: true)
- `wait_time` (integer, optional): Seconds to wait for results (default: 10)

**Response:**
```json
{
  "success": true,
  "image_urls": [
    "https://api.lenso.ai/proxy/...",
    "https://api.lenso.ai/proxy/...",
    ...
  ],
  "count": 8,
  "message": "Successfully found 8 results"
}
```

### 2. Upload Image File

Upload an image file directly to Lenso.ai.

**Endpoint:** `POST /upload-image-file`

**Request:** `multipart/form-data`
- `file` (file, required): Image file to upload
- `headless` (boolean, optional): Run browser in headless mode (default: true)
- `wait_time` (integer, optional): Seconds to wait for results (default: 10)

**Response:** Same as upload by path

### 3. Create Browser Session

Create a persistent browser session for multiple operations.

**Endpoint:** `POST /create-session`

**Request Body:**
```json
{
  "headless": true,
  "user_data_dir": "/path/to/profile"
}
```

**Parameters:**
- `headless` (boolean, optional): Run browser in headless mode (default: true)
- `user_data_dir` (string, optional): Directory for browser profile

**Response:**
```json
{
  "session_id": "uuid-string",
  "status": "created"
}
```

### 4. Upload Image with Session

Upload an image using an existing browser session.

**Endpoint:** `POST /session/{session_id}/upload-image`

**Request:** `multipart/form-data`
- `file` (file, required): Image file to upload
- `wait_time` (integer, optional): Seconds to wait for results (default: 10)

**Response:** Same as upload by path, with additional metadata

### 5. Close Browser Session

Close a browser session and cleanup resources.

**Endpoint:** `DELETE /session/{session_id}`

**Response:**
```json
{
  "session_id": "uuid-string",
  "status": "closed"
}
```

### 6. List Active Sessions

List all active browser sessions.

**Endpoint:** `GET /sessions`

**Response:**
```json
{
  "active_sessions": ["uuid-string-1", "uuid-string-2"]
}
```

## Usage Examples

### Python Example

```python
import requests

# Upload image by path
response = requests.post(
    "http://localhost:8000/api/v1/automation/upload-image",
    json={
        "image_path": "/path/to/image.jpg",
        "headless": False,
        "wait_time": 15
    }
)
result = response.json()
print(f"Found {result['count']} images")

# Create session and upload file
session_response = requests.post(
    "http://localhost:8000/api/v1/automation/create-session",
    json={"headless": False}
)
session_id = session_response.json()["session_id"]

with open("/path/to/image.jpg", "rb") as f:
    files = {"file": f}
    upload_response = requests.post(
        f"http://localhost:8000/api/v1/automation/session/{session_id}/upload-image",
        files=files,
        data={"wait_time": 15}
    )
    result = upload_response.json()
    print(f"Found {result['count']} images")

# Close session
requests.delete(f"http://localhost:8000/api/v1/automation/session/{session_id}")
```

### cURL Example

```bash
# Upload image by path
curl -X POST "http://localhost:8000/api/v1/automation/upload-image" \
  -H "Content-Type: application/json" \
  -d '{
    "image_path": "/path/to/image.jpg",
    "headless": false,
    "wait_time": 15
  }'

# Upload file
curl -X POST "http://localhost:8000/api/v1/automation/upload-image-file" \
  -F "file=@/path/to/image.jpg" \
  -F "headless=false" \
  -F "wait_time=15"
```

## Error Handling

The API returns appropriate HTTP status codes:

- `200`: Success
- `400`: Bad request (invalid file type, file too large, etc.)
- `404`: Not found (file not found, session not found)
- `500`: Internal server error

Error responses include:
```json
{
  "detail": "Error message describing what went wrong"
}
```

## File Requirements

- **Supported formats:** JPEG, PNG, WEBP, TIFF, HEIC, HEIF, AVIF
- **Maximum size:** 10MB
- **Minimum resolution:** 200x200px

## Notes

- The API uses Patchright for undetected browser automation
- CAPTCHA challenges may require manual intervention
- Browser sessions are stored in memory and will be lost on server restart
- Screenshots are saved to the current working directory for debugging
- Temporary uploaded files are automatically cleaned up

## Testing

Run the test script to verify functionality:

```bash
cd backend
uv run python test_automation.py
```

This will test both basic automation and persistent session functionality.