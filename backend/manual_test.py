#!/usr/bin/env python3
"""
Complete Lenso.ai scraper that uploads images and collects all result URLs.
Combines upload functionality with advanced URL extraction.
"""

import os
import time
from pathlib import Path
from selenium import webdriver
from selenium.webdriver.common.by import By
from selenium.webdriver.common.keys import Keys
from selenium.webdriver.support.ui import WebDriverWait
from selenium.webdriver.support import expected_conditions as EC
from selenium.webdriver.chrome.options import Options
from selenium.webdriver.chrome.service import Service
from selenium.webdriver.common.action_chains import ActionChains
from webdriver_manager.chrome import ChromeDriverManager
from selenium.common.exceptions import TimeoutException, NoSuchElementException, WebDriverException

def upload_and_scrape_lenso(image_path: str, headless: bool = False, proxy: str = None, wait_time: int = 10, setup=False) -> list:
    """
    Uploads an image to Lenso.ai and collects all result URLs from search results.

    Args:
        image_path (str): Path to the image file (JPG, PNG, WEBP; <10MB, >=200x200px).
        headless (bool): Run in headless mode (no browser UI).
        proxy (str): Optional proxy like 'http://user:pass@host:port'.
        wait_time (int): Seconds to wait after upload for results.
        setup (bool): If True, pause for manual login to save session.

    Returns:
        list: List of dictionaries with domain, title, and URL from all results.
    """
    # Validate image
    if not os.path.exists(image_path):
        raise FileNotFoundError(f"Image not found: {image_path}")
    file_size = os.path.getsize(image_path) / (1024 * 1024)  # MB
    if file_size > 10:
        raise ValueError(f"File too large: {file_size:.1f}MB (max 10MB)")

    # Chrome options for anti-detection
    chrome_options = Options()

    # Set up persistent browser profile
    profile_dir = os.path.abspath("chrome_profile")
    chrome_options.add_argument(f"--user-data-dir={profile_dir}")
    chrome_options.add_argument("--profile-directory=Default")

    if headless:
        chrome_options.add_argument("--headless")
    chrome_options.add_argument("--no-sandbox")
    chrome_options.add_argument("--disable-dev-shm-usage")
    chrome_options.add_argument("--disable-blink-features=AutomationControlled")
    chrome_options.add_experimental_option("excludeSwitches", ["enable-automation"])
    chrome_options.add_experimental_option('useAutomationExtension', False)
    chrome_options.add_argument("user-agent=Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36")

    if proxy:
        chrome_options.add_argument(f"--proxy-server={proxy}")

    # Setup driver
    service = Service(ChromeDriverManager().install())
    driver = webdriver.Chrome(service=service, options=chrome_options)
    driver.execute_script("Object.defineProperty(navigator, 'webdriver', {get: () => undefined})")

    try:
        # Navigate to Lenso.ai
        print("Navigating to Lenso.ai...")
        driver.get("https://lenso.ai")
        if setup:
            input("Please log in to Lenso.ai in the browser, then press Enter to continue...")
            print("Browser profile saved! You can now run with setup=False to reuse this session.")

        # Handle cookie consent button if it appears
        wait = WebDriverWait(driver, 10)
        try:
            cookie_button = wait.until(
                EC.element_to_be_clickable((By.ID, "CybotCookiebotDialogBodyLevelButtonLevelOptinAllowAll"))
            )
            cookie_button.click()
            print("Clicked 'Allow all' cookie button.")
            time.sleep(1)  # Wait for modal to close
        except TimeoutException:
            print("No cookie consent button found (may have been accepted already).")

        # Wait for upload area to load
        upload_wrapper = wait.until(
            EC.presence_of_element_located((By.CSS_SELECTOR, "div.wrapper[data-v-009573f6]"))
        )
        print("Upload area loaded.")

        # Method 1: Try to find hidden <input type="file"> (most reliable)
        try:
            file_input = wait.until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='file']"))
            )
            # Click to focus if hidden
            driver.execute_script("arguments[0].click();", file_input)
            print("Found and clicked hidden file input.")
        except TimeoutException:
            # Method 2: Fallback to clicking the drag area to trigger input
            print("No direct file input; clicking drag area...")
            drag_area = upload_wrapper.find_element(By.CSS_SELECTOR, "div.drag-area-icon, div.drag-area-title")
            drag_area.click()
            # Now look for the input that may appear after click
            file_input = wait.until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "input[type='file']"))
            )

        # Upload the file
        file_input.send_keys(os.path.abspath(image_path))
        print(f"Uploaded: {os.path.basename(image_path)}")

        # Wait for and handle privacy consent modal
        try:
            # Wait for the consent modal container to appear
            print("Waiting for consent modal...")
            consent_modal = wait.until(
                EC.presence_of_element_located((By.CSS_SELECTOR, "div.manage-consents-modal"))
            )
            print("Consent modal appeared.")
            time.sleep(1)  # Give modal time to fully render

            # Click privacy policy checkbox using JavaScript for reliability
            privacy_checkbox = driver.find_element(By.ID, "privacy-policy")
            driver.execute_script("arguments[0].click();", privacy_checkbox)
            print("Clicked privacy policy checkbox.")
            time.sleep(0.5)

            # Click facial search consent checkbox using JavaScript
            facial_checkbox = driver.find_element(By.ID, "facial-search-consent")
            driver.execute_script("arguments[0].click();", facial_checkbox)
            print("Clicked facial search consent checkbox.")
            time.sleep(1)

            # Click the "Perform Search" button (wait for it to be enabled)
            search_button = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "button.perfom-search-btn"))
            )
            driver.execute_script("arguments[0].click();", search_button)
            print("Clicked 'Perform Search' button.")
            input("Please do the Captcha and press Enter to continue...")
            search_button = WebDriverWait(driver, 10).until(
                EC.element_to_be_clickable((By.CSS_SELECTOR, "button.verify-btn"))
            )
            driver.execute_script("arguments[0].click();", search_button)
        except TimeoutException as e:
            print(f"No consent modal found or timeout: {e}")
            driver.save_screenshot("consent_modal_error.png")
        except Exception as e:
            print(f"Error handling consent modal: {e}")
            driver.save_screenshot("consent_modal_error.png")

        # Wait for upload progress/results
        print("Waiting for search results...")
        time.sleep(wait_time)

        # Collect all URLs from results
        all_urls = []

        try:
            # Wait a bit for results to load
            time.sleep(3)

            # Find all grid columns
            grid_cols = driver.find_elements(By.CSS_SELECTOR, "div.grid-col")
            print(f"Found {len(grid_cols)} grid columns.")

            if len(grid_cols) == 0:
                print("No grid columns found! Taking screenshot...")
                driver.save_screenshot("no_results_error.png")
                return all_urls

            # Collect all result cards from all grid columns
            result_cards = []
            for col in grid_cols:
                cards = col.find_elements(By.CSS_SELECTOR, "div.result-card--people[grid-item='true']")
                result_cards.extend(cards)

            print(f"Found {len(result_cards)} total result cards.")

            if len(result_cards) == 0:
                print("No result cards found! Taking screenshot...")
                driver.save_screenshot("no_results_error.png")
                return all_urls

            # Process each result card
            for idx, card in enumerate(result_cards, 1):
                try:
                    print(f"\n{'='*60}")
                    print(f"Processing card {idx}/{len(result_cards)}...")

                    # Get card info for debugging
                    card_id = card.get_attribute("id")
                    print(f"  Card ID: {card_id}")

                    # Scroll card into view
                    driver.execute_script("arguments[0].scrollIntoView({block: 'center'});", card)
                    time.sleep(0.5)

                    # Try multiple click methods
                    clicked = False

                    # Method 1: ActionChains click
                    try:
                        ActionChains(driver).move_to_element(card).click().perform()
                        print("  Clicked with ActionChains")
                        clicked = True
                    except Exception as e:
                        print(f"  ActionChains click failed: {e}")

                    # Method 2: Regular click if ActionChains failed
                    if not clicked:
                        try:
                            card.click()
                            print("  Clicked with regular click()")
                            clicked = True
                        except Exception as e:
                            print(f"  Regular click failed: {e}")

                    # Method 3: JavaScript click if both failed
                    if not clicked:
                        try:
                            driver.execute_script("arguments[0].click();", card)
                            print("  Clicked with JavaScript")
                            clicked = True
                        except Exception as e:
                            print(f"  JavaScript click failed: {e}")

                    if not clicked:
                        print("  WARNING: All click methods failed!")
                        continue

                    print("  Waiting for modal...")
                    time.sleep(2)

                    # Check if modal opened
                    try:
                        modal = driver.find_element(By.CSS_SELECTOR, ".modal, [role='dialog'], .result-modal")
                        print("  Modal detected!")
                    except NoSuchElementException:
                        print("  WARNING: No modal found after click!")
                        driver.save_screenshot(f"no_modal_{idx}.png")

                    # Store the main window handle
                    main_window = driver.current_window_handle
                    initial_windows = driver.window_handles

                    # Handle search results list (locked or unlocked)
                    try:
                        # RIGHT HERE GET THE IMAGE!!!!!
                        # Find the search results list
                        search_results_list = driver.find_element(By.CSS_SELECTOR, "div.search-results-list")
                        list_classes = search_results_list.get_attribute("class")
                        print(f"  Found search results list with classes: {list_classes}")

                        # Check if it's locked
                        if "locked" in list_classes:
                            print("  Search results are LOCKED. Clicking to unlock...")
                            driver.execute_script("arguments[0].click();", search_results_list)
                            time.sleep(2)

                            # Verify it unlocked
                            list_classes = search_results_list.get_attribute("class")
                            if "locked" in list_classes:
                                print("  WARNING: Still locked after click!")
                            else:
                                print("  Successfully unlocked!")
                        else:
                            print("  Search results are already unlocked")

                        # Now iterate through all result items
                        result_items = search_results_list.find_elements(By.CSS_SELECTOR, "div.result")
                        print(f"  Found {len(result_items)} result items")

                        for result_idx, result_item in enumerate(result_items, 1):
                            try:
                                # Get the corresponding image URL by index
                                print('trying to extract image-thumbnail')
                                thumb = WebDriverWait(driver, 10).until(
                                    EC.presence_of_element_located((By.CSS_SELECTOR, ".image-thumbnail img"))
                                )
                                # Extract the src attribute
                                image_url = thumb.get_attribute("src")
                                print(f"got {image_url}!")
                                # Get domain and title info
                                domain_name = result_item.find_element(By.CSS_SELECTOR, "p.domain-name").text
                                title = result_item.find_element(By.CSS_SELECTOR, "p.title").text
                                print(f"    {domain_name} - {title}")

                                # Find the globe button (first button in actions)
                                globe_button = result_item.find_element(By.CSS_SELECTOR, "div.actions button:first-child")

                                # Click the globe button to open the URL
                                driver.execute_script("arguments[0].click();", globe_button)
                                print(f"    Clicked globe button")
                                time.sleep(1)

                                # Check if a new tab opened
                                new_windows = driver.window_handles
                                if len(new_windows) > len(initial_windows):
                                    # Switch to new tab
                                    for window in new_windows:
                                        if window not in initial_windows:
                                            driver.switch_to.window(window)
                                            new_url = driver.current_url
                                            print(f"    Website URL: {new_url}")
                                            all_urls.append({
                                                'domain': domain_name,
                                                'title': title,
                                                'url': new_url,
                                                'image_url': image_url
                                            })
                                            driver.close()
                                            driver.switch_to.window(main_window)
                                            initial_windows = driver.window_handles
                                else:
                                    print(f"    No new tab opened for {domain_name}")

                            except Exception as e:
                                print(f"    Error processing result item {result_idx}: {e}")
                                continue

                    except NoSuchElementException:
                        print("  No search results list found")

                    # Close modal by pressing ESC
                    try:
                        driver.find_element(By.TAG_NAME, 'body').send_keys(Keys.ESCAPE)
                        time.sleep(1)
                        print("  Closed modal")
                    except:
                        print("  Could not close modal")

                except Exception as e:
                    print(f"  Error processing card {idx}: {e}")
                    driver.save_screenshot(f"card_error_{idx}.png")
                    # Try to close any open modal before continuing
                    try:
                        driver.find_element(By.TAG_NAME, 'body').send_keys(Keys.ESCAPE)
                    except:
                        pass
                    continue

            print(f"\n{'='*60}")
            print(f"Total URLs collected: {len(all_urls)}")
            print(f"{'='*60}")

        except Exception as e:
            print(f"Error collecting results: {e}")
            driver.save_screenshot("collection_error.png")

        # Take screenshot for verification
        screenshot_path = Path("lenso_results.png")
        driver.save_screenshot(str(screenshot_path))
        print(f"Screenshot saved: {screenshot_path}")

        return all_urls

    except TimeoutException as e:
        print(f"Timeout: {e}. Page may have Cloudflare challenge or slow load.")
        driver.save_screenshot("lenso_error.png")
        return []
    except NoSuchElementException as e:
        print(f"Element not found: {e}. Upload UI may have changed.")
        return []
    except WebDriverException as e:
        print(f"Browser error: {e}. Try non-headless or different proxy.")
        return []
    finally:
        driver.quit()

# Example usage
if __name__ == "__main__":
    image_file = r"/home/newton/pimeyes/backend/app/test_data/image_3.webp"  # Replace with your filepath

    # First time setup: Run with setup=True to log in and save the session
    # urls = upload_and_scrape_lenso(image_file, headless=False, setup=True)

    # Normal usage: Run with setup=False (default) to reuse saved session
    urls = upload_and_scrape_lenso(image_file, headless=False, setup=False)

    if urls:
        print(f"\n{'='*80}")
        print(f"SUCCESS! Collected {len(urls)} URLs:")
        print(f"{'='*80}")
        for i, url_data in enumerate(urls, 1):
            print(f"\n{i}. Domain: {url_data['domain']}")
            print(f"   Title: {url_data['title']}")
            print(f"   Website URL: {url_data['url']}")
            print(f"   Image URL: {url_data.get('image_url', 'N/A')}")
    else:
        print("\nUpload failed or no results found.")