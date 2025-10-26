"""
API endpoints for browser automation functionality.
Provides endpoints for image upload and search using Patchright.
"""

from pathlib import Path
from typing import Any

from fastapi import APIRouter, BackgroundTasks, File, Form, HTTPException, UploadFile
from pydantic import BaseModel, Field

from app.core.log_config import logger
from app.lenso_automation import LensoAutomation, extract_urls_from_results, upload_image_to_lenso

router = APIRouter(prefix="/automation", tags=["automation"])


class ImageUploadRequest(BaseModel):
    """Request model for image upload by path."""
    image_path: str = Field(..., description="Path to the image file")
    headless: bool = Field(True, description="Run browser in headless mode")
    wait_time: int = Field(10, description="Seconds to wait for results")


class ImageUploadResponse(BaseModel):
    """Response model for image upload results."""
    success: bool = Field(..., description="Whether the upload was successful")
    image_urls: list[str] = Field(default=[], description="List of result image URLs")
    count: int = Field(default=0, description="Number of results found")
    message: str = Field(default="", description="Status message")
    search_url: str | None = Field(default=None, description="URL of the generated search results page")
    metadata: dict[str, Any] | None = Field(default=None, description="Additional metadata")


class ExtractUrlsRequest(BaseModel):
    """Request model for extracting URLs from a Lenso.ai results page."""
    results_url: str = Field(..., description="URL of the Lenso.ai results page")
    headless: bool = Field(True, description="Run browser in headless mode")
    max_urls: int = Field(1, description="Maximum number of URLs to extract")


class ExtractedUrl(BaseModel):
    """Model for a single extracted URL result."""
    domain: str = Field(..., description="Domain name of the result")
    title: str = Field(..., description="Title of the result")
    url: str = Field(..., description="Extracted URL")
    image_url: str = Field(..., description="Image URL associated with the result")


class ExtractUrlsResponse(BaseModel):
    """Response model for URL extraction results."""
    success: bool = Field(..., description="Whether the extraction was successful")
    urls: list[ExtractedUrl] = Field(default=[], description="List of extracted URLs")
    count: int = Field(default=0, description="Number of URLs extracted")
    message: str = Field(default="", description="Status message")
    results_url: str | None = Field(default=None, description="URL of the results page that was processed")


class BrowserSessionRequest(BaseModel):
    """Request model for creating a persistent browser session."""
    headless: bool = Field(True, description="Run browser in headless mode")
    user_data_dir: str | None = Field(None, description="Directory for browser profile")


# Store active browser sessions (in production, use Redis or similar)
active_sessions: dict[str, LensoAutomation] = {}


@router.post("/upload-image", response_model=ImageUploadResponse)
async def upload_image_by_path(request: ImageUploadRequest) -> ImageUploadResponse:
    """
    Upload an image to Lenso.ai by file path and get search results.
    
    Args:
        request: Image upload request with file path and options
        
    Returns:
        ImageUploadResponse with search results or error message
    """
    try:
        # Validate image path
        if not Path(request.image_path).exists():
            raise HTTPException(
                status_code=404,
                detail=f"Image file not found: {request.image_path}"
            )
            
        # Perform the upload and search
        result = await upload_image_to_lenso(
            image_path=request.image_path,
            headless=request.headless,
            wait_time=request.wait_time
        )
        
        return ImageUploadResponse(
            success=True,
            image_urls=result.get("image_urls", []),
            count=result.get("count", 0),
            message=f"Successfully found {result.get('count', 0)} results",
            search_url=result.get("search_url")
        )
        
    except FileNotFoundError as e:
        logger.error(f"File not found: {e}")
        raise HTTPException(status_code=404, detail=str(e)) from e
        
    except ValueError as e:
        logger.error(f"Invalid file: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e
        
    except Exception as e:
        logger.error(f"Error uploading image: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload image: {e!s}"
        ) from e


@router.post("/upload-image-file", response_model=ImageUploadResponse)
async def upload_image_file(
    background_tasks: BackgroundTasks,
    file: UploadFile = File(...),
    headless: bool = Form(True),
    wait_time: int = Form(10)
) -> ImageUploadResponse:
    """
    Upload an image file to Lenso.ai and get search results.
    
    Args:
        background_tasks: FastAPI background tasks for cleanup
        file: Image file to upload
        headless: Whether to run browser in headless mode
        wait_time: Seconds to wait for results
        
    Returns:
        ImageUploadResponse with search results or error message
    """
    try:
        # Validate file type
        allowed_types = ["image/jpeg", "image/png", "image/webp"]
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
            )
            
        # Validate file size (10MB max)
        max_size = 10 * 1024 * 1024  # 10MB in bytes
        file_content = await file.read()
        if len(file_content) > max_size:
            raise HTTPException(
                status_code=400,
                detail="File too large. Maximum size: 10MB"
            )
            
        # Save uploaded file temporarily
        temp_dir = "temp_uploads"
        Path(temp_dir).mkdir(exist_ok=True)
        temp_file_path = Path(temp_dir) / file.filename
        
        with temp_file_path.open("wb") as temp_file:
            temp_file.write(file_content)
            
        # Schedule cleanup of temp file
        background_tasks.add_task(cleanup_temp_file, temp_file_path)
        
        # Perform the upload and search
        result = await upload_image_to_lenso(
            image_path=temp_file_path,
            headless=headless,
            wait_time=wait_time
        )
        
        return ImageUploadResponse(
            success=True,
            image_urls=result.get("image_urls", []),
            count=result.get("count", 0),
            message=f"Successfully found {result.get('count', 0)} results",
            search_url=result.get("search_url")
        )
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error(f"Error uploading image file: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload image: {e!s}"
        ) from e


@router.post("/create-session")
async def create_browser_session(request: BrowserSessionRequest) -> dict[str, str]:
    """
    Create a persistent browser session for multiple operations.
    
    Args:
        request: Session creation request
        
    Returns:
        Session ID for the created browser session
    """
    try:
        # Generate unique session ID
        import uuid
        session_id = str(uuid.uuid4())
        
        # Create browser automation instance
        automation = LensoAutomation(
            headless=request.headless,
            user_data_dir=request.user_data_dir
        )
        
        # Start the browser
        await automation.start()
        
        # Store the session
        active_sessions[session_id] = automation
        
        logger.info(f"Created browser session: {session_id}")
        
        return {"session_id": session_id, "status": "created"}
        
    except Exception as e:
        logger.error(f"Error creating browser session: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to create session: {e!s}"
        ) from e


@router.post("/session/{session_id}/upload-image")
async def upload_image_with_session(
    session_id: str,
    file: UploadFile = File(...),
    wait_time: int = Form(10)
) -> ImageUploadResponse:
    """
    Upload an image using an existing browser session.
    
    Args:
        session_id: ID of the browser session to use
        file: Image file to upload
        wait_time: Seconds to wait for results
        
    Returns:
        ImageUploadResponse with search results or error message
    """
    try:
        # Validate session exists
        if session_id not in active_sessions:
            raise HTTPException(
                status_code=404,
                detail="Session not found"
            )
            
        automation = active_sessions[session_id]
        
        # Validate file type
        allowed_types = ["image/jpeg", "image/png", "image/webp"]
        if file.content_type not in allowed_types:
            raise HTTPException(
                status_code=400,
                detail=f"Invalid file type. Allowed types: {', '.join(allowed_types)}"
            )
            
        # Save uploaded file temporarily
        temp_dir = "temp_uploads"
        Path(temp_dir).mkdir(exist_ok=True)
        temp_file_path = Path(temp_dir) / file.filename
        
        file_content = await file.read()
        with temp_file_path.open("wb") as temp_file:
            temp_file.write(file_content)
            
        # Perform the upload and search using existing session
        result = await automation.upload_image_to_lenso(
            image_path=temp_file_path,
            wait_time=wait_time
        )
        
        # Get additional metadata
        metadata = await automation.get_search_results_info()
        
        # Cleanup temp file
        temp_file_path.unlink()
        
        return ImageUploadResponse(
            success=True,
            image_urls=result.get("image_urls", []),
            count=result.get("count", 0),
            message=f"Successfully found {result.get('count', 0)} results",
            search_url=result.get("search_url"),
            metadata=metadata
        )
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error(f"Error uploading image with session: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to upload image: {e!s}"
        ) from e


@router.delete("/session/{session_id}")
async def close_browser_session(session_id: str) -> dict[str, str]:
    """
    Close a browser session and cleanup resources.
    
    Args:
        session_id: ID of the session to close
        
    Returns:
        Status message
    """
    try:
        # Validate session exists
        if session_id not in active_sessions:
            raise HTTPException(
                status_code=404,
                detail="Session not found"
            )
            
        automation = active_sessions[session_id]
        await automation.close()
        
        # Remove from active sessions
        del active_sessions[session_id]
        
        logger.info(f"Closed browser session: {session_id}")
        
        return {"session_id": session_id, "status": "closed"}
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error(f"Error closing session: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to close session: {e!s}"
        ) from e


@router.get("/sessions")
async def list_active_sessions() -> dict[str, list[str]]:
    """
    List all active browser sessions.
    
    Returns:
        Dictionary with list of active session IDs
    """
    return {"active_sessions": list(active_sessions.keys())}


@router.post("/extract-urls", response_model=ExtractUrlsResponse)
async def extract_urls_from_results_page(request: ExtractUrlsRequest) -> ExtractUrlsResponse:
    """
    Extract URLs from a Lenso.ai results page without uploading an image.
    
    Args:
        request: Extract URLs request with results URL and options
        
    Returns:
        ExtractUrlsResponse with extracted URLs or error message
    """
    try:
        # Validate the URL format
        if not request.results_url.startswith("https://lenso.ai"):
            raise HTTPException(
                status_code=400,
                detail="Invalid URL. Must be a valid Lenso.ai results URL"
            )
            
        # Perform the URL extraction
        result = await extract_urls_from_results(
            results_url=request.results_url,
            headless=request.headless,
            max_urls=request.max_urls
        )
        
        # Convert the result to our response model
        extracted_urls = [
            ExtractedUrl(
                domain=url_data.get("domain", ""),
                title=url_data.get("title", ""),
                url=url_data.get("url", ""),
                image_url=url_data.get("image_url", "")
            )
            for url_data in result.get("urls", [])
        ]
        
        return ExtractUrlsResponse(
            success=True,
            urls=extracted_urls,
            count=result.get("count", 0),
            message=f"Successfully extracted {result.get('count', 0)} URLs",
            results_url=result.get("results_url")
        )
        
    except HTTPException:
        raise
        
    except Exception as e:
        logger.error(f"Error extracting URLs: {e}")
        raise HTTPException(
            status_code=500,
            detail=f"Failed to extract URLs: {e!s}"
        ) from e


async def cleanup_temp_file(file_path: str) -> None:
    """
    Clean up temporary uploaded file.
    
    Args:
        file_path: Path to the temporary file to remove
    """
    try:
        if Path(file_path).exists():
            Path(file_path).unlink()
            logger.info(f"Cleaned up temporary file: {file_path}")
    except Exception as e:
        logger.error(f"Error cleaning up temp file {file_path}: {e}")