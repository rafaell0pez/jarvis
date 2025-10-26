"""
Browser automation module using Patchright for undetected browser automation.
Provides functionality to upload images to Lenso.ai and extract search results.
"""

from pathlib import Path
from typing import Any

from patchright.async_api import async_playwright

from app.core.log_config import logger


class BrowserAutomation:
    """Browser automation class using Patchright for undetected browser automation."""
    
    def __init__(self, headless: bool = True, user_data_dir: str | None = None):
        """
        Initialize the browser automation instance.
        
        Args:
            headless: Whether to run browser in headless mode
            user_data_dir: Directory for persistent browser profile
        """
        self.headless = headless
        self.user_data_dir = user_data_dir or "./browser_profile"
        self.playwright = None
        self.browser = None
        self.context = None
        
    async def __aenter__(self):
        """Async context manager entry."""
        await self.start()
        return self
        
    async def __aexit__(self, exc_type, exc_val, exc_tb):
        """Async context manager exit."""
        await self.close()
        
    async def start(self) -> None:
        """Start the browser with stealth configuration."""
        logger.info("Starting browser with Patchright...")
        self.playwright = await async_playwright().start()
        
        # Launch with persistent context for maximum stealth
        self.context = await self.playwright.chromium.launch_persistent_context(
            user_data_dir=self.user_data_dir,
            channel="chrome",  # Use real Chrome instead of Chromium
            headless=self.headless,
            no_viewport=True,  # Use native viewport
            args=[
                "--disable-blink-features=AutomationControlled",
                "--no-sandbox",
                "--disable-dev-shm-usage",
            ]
        )
        
        # Get or create the first page
        if self.context.pages:
            self.page = self.context.pages[0]
        else:
            self.page = await self.context.new_page()
            
        logger.info("Browser started successfully")
        
    async def close(self) -> None:
        """Close the browser and cleanup resources."""
        if self.context:
            await self.context.close()
        if self.browser:
            await self.browser.close()
        if self.playwright:
            await self.playwright.stop()
        logger.info("Browser closed")
        
    async def navigate_to(self, url: str) -> None:
        """
        Navigate to a specific URL.
        
        Args:
            url: The URL to navigate to
        """
        logger.info(f"Navigating to {url}")
        await self.page.goto(url)
        await self.page.wait_for_load_state("networkidle")
        
    async def handle_cookie_consent(self) -> None:
        """Handle cookie consent dialogs if present."""
        try:
            # Look for common cookie consent buttons
            cookie_selectors = [
                "#CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll",
                "button[id*='cookie']",
                "button[id*='consent']",
                ".cookie-accept",
                ".consent-accept"
            ]
            
            for selector in cookie_selectors:
                try:
                    element = await self.page.wait_for_selector(selector, timeout=2000)
                    if element:
                        await element.click()
                        logger.info(f"Clicked cookie consent button: {selector}")
                        await self.page.wait_for_timeout(1000)
                        break
                except Exception as e:
                    logger.debug(f"Error clicking cookie button: {e}")
                    continue
                    
        except Exception as e:
            logger.debug(f"No cookie consent dialog found or error handling it: {e}")
            
    async def upload_file_to_input(self, file_path: str, input_selector: str = "input[type='file']") -> bool:
        """
        Upload a file using a file input element.
        
        Args:
            file_path: Path to the file to upload
            input_selector: CSS selector for the file input element
            
        Returns:
            True if upload was successful, False otherwise
        """
        try:
            # Validate file exists
            file_path_obj = Path(file_path)
            if not file_path_obj.exists():
                raise FileNotFoundError(f"File not found: {file_path}")
                
            # Wait for file input (don't require visibility)
            file_input = await self.page.wait_for_selector(input_selector, timeout=10000, state='attached')
            if not file_input:
                logger.error(f"File input not found with selector: {input_selector}")
                return False
                
            # Upload the file (works even if input is hidden)
            await file_input.set_input_files(file_path)
            logger.info(f"File uploaded successfully: {file_path_obj.name}")
            return True
            
        except Exception as e:
            logger.error(f"Error uploading file: {e}")
            return False
            
    async def click_element(self, selector: str, timeout: int = 10000) -> bool:
        """
        Click an element by CSS selector.
        
        Args:
            selector: CSS selector for the element to click
            timeout: Timeout in milliseconds
            
        Returns:
            True if click was successful, False otherwise
        """
        try:
            element = await self.page.wait_for_selector(selector, timeout=timeout)
            if element:
                await element.click()
                logger.info(f"Clicked element: {selector}")
                return True
            return False
        except Exception as e:
            logger.error(f"Error clicking element {selector}: {e}")
            return False
            
    async def wait_for_element(self, selector: str, timeout: int = 10000) -> bool:
        """
        Wait for an element to appear.
        
        Args:
            selector: CSS selector for the element to wait for
            timeout: Timeout in milliseconds
            
        Returns:
            True if element appeared, False otherwise
        """
        try:
            await self.page.wait_for_selector(selector, timeout=timeout)
            return True
        except Exception as e:
            logger.debug(f"Error waiting for element: {e}")
            return False
            
    async def get_element_text(self, selector: str) -> str | None:
        """
        Get text content of an element.
        
        Args:
            selector: CSS selector for the element
            
        Returns:
            Text content of the element or None if not found
        """
        try:
            element = await self.page.wait_for_selector(selector, timeout=5000)
            if element:
                return await element.text_content()
            return None
        except Exception as e:
            logger.error(f"Error getting text from {selector}: {e}")
            return None
            
    async def get_element_attribute(self, selector: str, attribute: str) -> str | None:
        """
        Get attribute value of an element.
        
        Args:
            selector: CSS selector for the element
            attribute: Attribute name to get
            
        Returns:
            Attribute value or None if not found
        """
        try:
            element = await self.page.wait_for_selector(selector, timeout=5000)
            if element:
                return await element.get_attribute(attribute)
            return None
        except Exception as e:
            logger.error(f"Error getting attribute {attribute} from {selector}: {e}")
            return None
            
    async def get_all_element_attributes(self, selector: str, attribute: str) -> list[str]:
        """
        Get attribute values from all matching elements.
        
        Args:
            selector: CSS selector for the elements
            attribute: Attribute name to get
            
        Returns:
            List of attribute values
        """
        try:
            elements = await self.page.query_selector_all(selector)
            attributes = []
            for element in elements:
                value = await element.get_attribute(attribute)
                if value:
                    attributes.append(value)
            return attributes
        except Exception as e:
            logger.error(f"Error getting attributes {attribute} from {selector}: {e}")
            return []
            
    async def take_screenshot(self, filename: str) -> None:
        """
        Take a screenshot of the current page.
        
        Args:
            filename: Filename for the screenshot
        """
        try:
            await self.page.screenshot(path=filename)
            logger.info(f"Screenshot saved: {filename}")
        except Exception as e:
            logger.error(f"Error taking screenshot: {e}")
            
    async def execute_javascript(self, script: str, *args) -> Any:
        """
        Execute JavaScript in the page context.
        
        Args:
            script: JavaScript code to execute
            *args: Arguments to pass to the script
            
        Returns:
            Result of the JavaScript execution
        """
        try:
            return await self.page.evaluate(script, *args)
        except Exception as e:
            logger.error(f"Error executing JavaScript: {e}")
            return None
            
    async def wait_for_timeout(self, milliseconds: int) -> None:
        """
        Wait for a specified amount of time.
        
        Args:
            milliseconds: Time to wait in milliseconds
        """
        await self.page.wait_for_timeout(milliseconds)