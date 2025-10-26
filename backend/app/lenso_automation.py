"""
Lenso.ai automation module using Patchright for image upload and search.
Handles the complete workflow from image upload to result extraction.
"""

from pathlib import Path
from typing import Any

from app.browser_automation import BrowserAutomation
from app.core.log_config import logger


class LensoAutomation(BrowserAutomation):
    """Specialized browser automation for Lenso.ai image search."""
    
    def __init__(self, headless: bool = True, user_data_dir: str | None = None):
        """
        Initialize Lenso automation with browser automation.
        
        Args:
            headless: Whether to run browser in headless mode
            user_data_dir: Directory for persistent browser profile
        """
        super().__init__(headless=headless, user_data_dir=user_data_dir)
        self.base_url = "https://lenso.ai"
        
    async def upload_image_to_lenso(self, image_path: str, wait_time: int = 3) -> dict[str, Any]:
        """
        Upload an image to Lenso.ai and collect all result image URLs.
        Optimized for premium accounts where results appear immediately.
        
        Args:
            image_path: Path to the image file (JPG, PNG, WEBP; <10MB, >=200x200px)
            wait_time: Seconds to wait after upload for results (reduced for premium)
            
        Returns:
            Dictionary containing image URLs and search metadata
        """
        try:
            # Validate image
            image_path_obj = Path(image_path)
            if not image_path_obj.exists():
                raise FileNotFoundError(f"Image not found: {image_path}")
                
            file_size = image_path_obj.stat().st_size / (1024 * 1024)  # MB
            if file_size > 10:
                raise ValueError(f"File too large: {file_size:.1f}MB (max 10MB)")
                
            logger.info(f"Starting Lenso.ai upload for: {image_path_obj.name}")
            
            # Navigate to Lenso.ai
            await self.navigate_to(self.base_url)
            
            # Handle cookie consent
            await self.handle_cookie_consent()
            
            # Wait for upload area to load
            if not await self.wait_for_element("div.wrapper[data-v-009573f6]", timeout=10000):
                logger.error("Upload area not found")
                return []
                
            logger.info("Upload area loaded")
            
            # Method 1: Try to find hidden <input type="file"> (most reliable)
            upload_success = await self.upload_file_to_input(image_path, "input[type='file']")
            
            if not upload_success:
                # Method 2: Fallback to clicking the drag area to trigger input
                logger.info("No direct file input; clicking drag area...")
                await self.click_element("div.drag-area-icon, div.drag-area-title")
                await self.wait_for_timeout(1000)
                upload_success = await self.upload_file_to_input(image_path, "input[type='file']")
                
            if not upload_success:
                logger.error("Failed to upload image")
                return []
                
            logger.info(f"Image uploaded successfully: {image_path_obj.name}")
            
            # For premium accounts, check if results appear immediately
            # Wait a short time for results to load (premium accounts are faster)
            logger.info("Waiting for search results to load...")
            await self.wait_for_timeout(2000)  # Initial short wait
            
            # Check if consent modal appears (free account) or results appear directly (premium)
            consent_modal_found = await self.wait_for_element("div.manage-consents-modal", timeout=3000)
            
            if consent_modal_found:
                logger.info("Free account detected - handling consent modal")
                await self.handle_privacy_consent()
                # Wait longer for results after consent
                await self.wait_for_timeout(wait_time * 1000)
            else:
                logger.info("Premium account detected - results should appear immediately")
                # Wait a bit more for results to fully load
                await self.wait_for_timeout(3000)
            
            # Collect all image URLs from results
            image_urls = await self.collect_result_images()
            
            # Take screenshot for verification
            screenshot_path = Path("lenso_results.png")
            await self.take_screenshot(str(screenshot_path))
            
            # Get the current search URL
            search_url = self.page.url
            
            logger.info(f"Collected {len(image_urls)} image URLs from Lenso.ai")
            return {
                "image_urls": image_urls,
                "search_url": search_url,
                "count": len(image_urls)
            }
            
        except Exception as e:
            logger.error(f"Error in Lenso.ai automation: {e}")
            await self.take_screenshot("lenso_error.png")
            return []
            
    async def handle_privacy_consent(self) -> None:
        """Handle the privacy consent modal that appears after upload."""
        try:
            logger.info("Waiting for consent modal...")
            
            # Wait for the consent modal container to appear
            if not await self.wait_for_element("div.manage-consents-modal", timeout=10000):
                logger.info("No consent modal found")
                return
                
            logger.info("Consent modal appeared")
            await self.wait_for_timeout(1000)  # Give modal time to fully render
            
            # Click privacy policy checkbox using JavaScript for reliability
            await self.execute_javascript(
                "document.getElementById('privacy-policy').click();"
            )
            logger.info("Clicked privacy policy checkbox")
            await self.wait_for_timeout(500)
            
            # Click facial search consent checkbox using JavaScript
            await self.execute_javascript(
                "document.getElementById('facial-search-consent').click();"
            )
            logger.info("Clicked facial search consent checkbox")
            await self.wait_for_timeout(1000)
            
            # Click the "Perform Search" button (wait for it to be enabled)
            if await self.wait_for_element("button.perfom-search-btn", timeout=10000):
                await self.execute_javascript(
                    "document.querySelector('button.perfom-search-btn').click();"
                )
                logger.info("Clicked 'Perform Search' button")
                
                # Note: Captcha handling would need manual intervention or a captcha service
                logger.warning("CAPTCHA may need to be solved manually")
                
                # Wait for potential captcha verification button
                await self.wait_for_timeout(3000)
                if await self.wait_for_element("button.verify-btn", timeout=5000):
                    await self.execute_javascript(
                        "document.querySelector('button.verify-btn').click();"
                    )
                    logger.info("Clicked verification button")
            else:
                logger.warning("Perform Search button not found")
                
        except Exception as e:
            logger.error(f"Error handling consent modal: {e}")
            await self.take_screenshot("consent_modal_error.png")
            
    async def collect_result_images(self) -> list[str]:
        """
        Collect all image URLs from the search results.
        Optimized for premium account HTML structure.
        
        Returns:
            List of image URLs from search results
        """
        try:
            # Wait for search results container to appear
            results_loaded = await self.wait_for_element("div.search-results", timeout=10000)
            
            if not results_loaded:
                logger.warning("Search results container not found")
                await self.take_screenshot("no_results_container.png")
                return []
            
            logger.info("Search results container found")
            
            # Additional short wait for all images to load
            await self.wait_for_timeout(2000)
            
            # Find all images with class "result-image" within the search results
            # This is more specific and avoids picking up images from other sections
            image_urls = await self.get_all_element_attributes("div.search-results img.result-image", "src")
            
            # Also try alternative selectors in case the structure varies
            if not image_urls:
                image_urls = await self.get_all_element_attributes("img.result-image", "src")
            
            # Filter out any non-proxy URLs (premium accounts use proxy URLs)
            filtered_urls = [url for url in image_urls if url and "api" in url and "lenso.ai" in url]
            
            logger.info(f"Found {len(filtered_urls)} result images (filtered from {len(image_urls)} total)")
            
            if len(filtered_urls) == 0:
                logger.warning("No valid result images found!")
                await self.take_screenshot("no_results_error.png")
                
            # Log first few URLs for debugging
            for idx, url in enumerate(filtered_urls[:5], 1):
                logger.debug(f"  {idx}. {url[:80]}...")
                
            return filtered_urls
            
        except Exception as e:
            logger.error(f"Error collecting results: {e}")
            await self.take_screenshot("collection_error.png")
            return []
            
    async def get_search_results_info(self) -> dict[str, Any]:
        """
        Get additional information about the search results.
        
        Returns:
            Dictionary containing search results metadata
        """
        try:
            # Get page title
            title = await self.execute_javascript("() => document.title")
            
            # Get number of results (if available)
            results_count = None
            count_selectors = [
                ".results-count",
                ".search-results-count",
                "[data-results-count]"
            ]
            
            for selector in count_selectors:
                count_text = await self.get_element_text(selector)
                if count_text:
                    results_count = count_text
                    break
                    
            # Get any error messages
            error_message = await self.get_element_text(".error-message, .alert-error")
            
            return {
                "title": title,
                "results_count": results_count,
                "error_message": error_message,
                "current_url": self.page.url
            }
            
        except Exception as e:
            logger.error(f"Error getting search results info: {e}")
            return {}
            
    async def extract_urls_from_results_page(self, results_url: str, max_urls: int = 1) -> dict[str, Any]:
        """
        Navigate to a Lenso.ai results page and extract URLs from the search results.
        
        Args:
            results_url: URL of the Lenso.ai results page
            max_urls: Maximum number of URLs to extract (default: 1)
            
        Returns:
            Dictionary containing extracted URLs and metadata
        """
        try:
            logger.info(f"Navigating to results page: {results_url}")
            
            # Navigate to the results page
            await self.navigate_to(results_url)
            
            # Handle cookie consent if it appears
            await self.handle_cookie_consent()
            
            # Wait for results to load
            await self.wait_for_timeout(3000)
            
            # Get result cards
            result_cards = await self._get_result_cards()
            if not result_cards:
                return {"urls": [], "count": 0}
            
            # Limit the number of cards to process based on max_urls
            cards_to_process = result_cards[:min(max_urls, len(result_cards))]
            extracted_urls = []
            
            # Process each result card
            for idx, card in enumerate(cards_to_process, 1):
                url_data = await self._process_result_card(card, idx, len(cards_to_process))
                if url_data:
                    extracted_urls.append(url_data)
            
            logger.info(f"Successfully extracted {len(extracted_urls)} URLs")
            
            # Take screenshot for verification
            screenshot_path = Path("extract_results.png")
            await self.take_screenshot(str(screenshot_path))
            
            return {
                "urls": extracted_urls,
                "count": len(extracted_urls),
                "results_url": results_url
            }
            
        except Exception as e:
            logger.error(f"Error extracting URLs from results page: {e}")
            await self.take_screenshot("extract_error.png")
            return {"urls": [], "count": 0}
    
    async def _get_result_cards(self) -> list:
        """Get all result cards from the page."""
        try:
            # Find all grid columns
            grid_cols = await self.page.query_selector_all("div.grid-col")
            logger.info(f"Found {len(grid_cols)} grid columns")
            
            if len(grid_cols) == 0:
                logger.warning("No grid columns found")
                await self.take_screenshot("no_results_error.png")
                return []
            
            # Collect all result cards from all grid columns
            result_cards = []
            for col in grid_cols:
                cards = await col.query_selector_all("div.result-card--people[grid-item='true']")
                result_cards.extend(cards)
            
            logger.info(f"Found {len(result_cards)} total result cards")
            
            if len(result_cards) == 0:
                logger.warning("No result cards found")
                await self.take_screenshot("no_results_error.png")
                return []
                
            return result_cards
            
        except Exception as e:
            logger.error(f"Error getting result cards: {e}")
            return []
    
    async def _process_result_card(self, card, idx: int, total: int) -> dict[str, str] | None:
        """Process a single result card and extract URL information."""
        try:
            logger.info(f"Processing card {idx}/{total}")
            
            # Scroll card into view
            await self.execute_javascript("arguments[0].scrollIntoView({block: 'center'});", card)
            await self.wait_for_timeout(500)
            
            # Click the card to open modal
            await card.click()
            logger.info("Clicked result card")
            await self.wait_for_timeout(2000)
            
            # Extract URL from the modal
            url_data = await self._extract_url_from_modal()
            
            # Close modal by pressing ESC
            await self.page.keyboard.press("Escape")
            await self.wait_for_timeout(1000)
            
            return url_data
            
        except Exception as e:
            logger.error(f"Error processing card {idx}: {e}")
            return None
    
    async def _extract_url_from_modal(self) -> dict[str, str] | None:
        """Extract URL information from the opened modal."""
        try:
            # Find the search results list
            search_results_list = await self.page.query_selector("div.search-results-list")
            if not search_results_list:
                logger.warning("No search results list found")
                return None
                
            # Unlock if needed
            await self._unlock_search_results(search_results_list)
            
            # Get the first result item
            result_item = await search_results_list.query_selector("div.result")
            if not result_item:
                logger.warning("No result item found")
                return None
                
            # Extract basic information
            url_info = await self._extract_result_info(result_item)
            if not url_info:
                return None
                
            # Click the globe button to open the URL
            final_url = await self._click_globe_button(result_item)
            if not final_url:
                return None
                
            url_info['url'] = final_url
            return url_info
            
        except Exception as e:
            logger.error(f"Error extracting URL from modal: {e}")
            return None
    
    async def _unlock_search_results(self, search_results_list) -> None:
        """Unlock search results if they are locked."""
        try:
            # Check if it's locked
            list_classes = await search_results_list.get_attribute("class")
            if list_classes and "locked" in list_classes:
                logger.info("Search results are locked. Clicking to unlock...")
                await search_results_list.click()
                await self.wait_for_timeout(2000)
                
                # Verify it unlocked
                list_classes = await search_results_list.get_attribute("class")
                if list_classes and "locked" in list_classes:
                    logger.warning("Still locked after click!")
                else:
                    logger.info("Successfully unlocked!")
            else:
                logger.info("Search results are already unlocked")
        except Exception as e:
            logger.error(f"Error unlocking search results: {e}")
    
    async def _extract_result_info(self, result_item) -> dict[str, str] | None:
        """Extract basic information from a result item."""
        try:
            # Get the image URL
            thumb = await result_item.query_selector(".image-thumbnail img")
            if not thumb:
                logger.warning("No image thumbnail found")
                return None
                
            image_url = await thumb.get_attribute("src")
            if not image_url:
                logger.warning("No image URL found")
                return None
                
            # Get domain and title info
            domain_element = await result_item.query_selector("p.domain-name")
            title_element = await result_item.query_selector("p.title")
            
            domain_name = await domain_element.text_content() if domain_element else "Unknown"
            title = await title_element.text_content() if title_element else "Unknown"
            
            logger.info(f"Found result: {domain_name} - {title}")
            
            return {
                'domain': domain_name,
                'title': title,
                'image_url': image_url
            }
            
        except Exception as e:
            logger.error(f"Error extracting result info: {e}")
            return None
    
    async def _click_globe_button(self, result_item) -> str | None:
        """Click the globe button and return the opened URL."""
        try:
            # Find the globe button (first button in actions)
            globe_button = await result_item.query_selector("div.actions button:first-child")
            if not globe_button:
                logger.warning("No globe button found")
                return None
                
            # Store the initial pages list
            initial_pages = self.context.pages
            
            # Click the globe button to open the URL
            await globe_button.click()
            logger.info("Clicked globe button")
            await self.wait_for_timeout(1000)
            
            # Check if a new tab opened
            new_pages = self.context.pages
            if len(new_pages) > len(initial_pages):
                # Find the new page
                new_page = None
                for page in new_pages:
                    if page not in initial_pages:
                        new_page = page
                        break
                        
                if new_page:
                    await new_page.wait_for_load_state("networkidle")
                    new_url = new_page.url
                    logger.info(f"Extracted URL: {new_url}")
                    
                    # Close the new page
                    await new_page.close()
                    return new_url
            else:
                logger.warning("No new tab opened")
                return None
                
        except Exception as e:
            logger.error(f"Error clicking globe button: {e}")
            return None


async def upload_image_to_lenso(image_path: str, headless: bool = True, wait_time: int = 10) -> dict[str, Any]:
    """
    Convenience function to upload an image to Lenso.ai and collect results.
    
    Args:
        image_path: Path to the image file
        headless: Whether to run browser in headless mode
        wait_time: Seconds to wait after upload for results
        
    Returns:
        Dictionary containing image URLs and search metadata
    """
    async with LensoAutomation(headless=headless) as automation:
        return await automation.upload_image_to_lenso(image_path, wait_time)


async def extract_urls_from_results(results_url: str, headless: bool = True, max_urls: int = 1) -> dict[str, Any]:
    """
    Convenience function to extract URLs from a Lenso.ai results page.
    
    Args:
        results_url: URL of the Lenso.ai results page
        headless: Whether to run browser in headless mode
        max_urls: Maximum number of URLs to extract (default: 1)
        
    Returns:
        Dictionary containing extracted URLs and metadata
    """
    async with LensoAutomation(headless=headless) as automation:
        return await automation.extract_urls_from_results_page(results_url, max_urls)