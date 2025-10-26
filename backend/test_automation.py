#!/usr/bin/env python3
"""
Test script for the Patchright browser automation implementation.
Tests the Lenso.ai image upload functionality.
"""

import asyncio
import os
import sys
from pathlib import Path

# Add the app directory to the Python path
sys.path.insert(0, os.path.join(os.path.dirname(__file__), "app"))

from app.lenso_automation import upload_image_to_lenso, LensoAutomation
from app.core.log_config import logger


async def test_lenso_automation():
    """Test the Lenso.ai automation with a sample image."""
    
    # Use the test image that's already in the project
    test_image_path = "app/test_data/image.webp"
    
    if not os.path.exists(test_image_path):
        logger.error(f"Test image not found: {test_image_path}")
        return False
        
    try:
        logger.info(f"Testing Lenso.ai automation with: {test_image_path}")
        
        # Test the convenience function
        image_urls = await upload_image_to_lenso(
            image_path=test_image_path,
            headless=False,  # Use headed mode for testing to see what's happening
            wait_time=15
        )
        
        logger.info(f"Test completed. Found {len(image_urls)} image URLs:")
        for i, url in enumerate(image_urls[:5], 1):  # Log first 5 URLs
            logger.info(f"  {i}. {url}")
            
        if len(image_urls) > 5:
            logger.info(f"  ... and {len(image_urls) - 5} more URLs")
            
        return len(image_urls) > 0
        
    except Exception as e:
        logger.error(f"Test failed with error: {e}")
        return False


async def test_browser_session():
    """Test the persistent browser session functionality."""
    
    test_image_path = "app/test_data/image.webp"
    
    if not os.path.exists(test_image_path):
        logger.error(f"Test image not found: {test_image_path}")
        return False
        
    try:
        logger.info("Testing persistent browser session...")
        
        # Create a persistent session
        async with LensoAutomation(headless=False) as automation:
            # Navigate to Lenso.ai first
            await automation.navigate_to("https://lenso.ai")
            await automation.wait_for_timeout(3000)
            
            # Take a screenshot to verify we're on the page
            await automation.take_screenshot("lenso_homepage.png")
            
            # Now upload the image
            image_urls = await automation.upload_image_to_lenso(
                image_path=test_image_path,
                wait_time=15
            )
            
            logger.info(f"Session test completed. Found {len(image_urls)} image URLs")
            
            return len(image_urls) > 0
            
    except Exception as e:
        logger.error(f"Session test failed with error: {e}")
        return False


async def main():
    """Main test function."""
    logger.info("Starting Patchright automation tests...")
    
    # Test 1: Basic automation
    logger.info("=" * 50)
    logger.info("Test 1: Basic Lenso.ai automation")
    logger.info("=" * 50)
    
    test1_result = await test_lenso_automation()
    logger.info(f"Test 1 result: {'PASSED' if test1_result else 'FAILED'}")
    
    # Test 2: Persistent session
    logger.info("=" * 50)
    logger.info("Test 2: Persistent browser session")
    logger.info("=" * 50)
    
    test2_result = await test_browser_session()
    logger.info(f"Test 2 result: {'PASSED' if test2_result else 'FAILED'}")
    
    # Summary
    logger.info("=" * 50)
    logger.info("TEST SUMMARY")
    logger.info("=" * 50)
    logger.info(f"Test 1 (Basic): {'PASSED' if test1_result else 'FAILED'}")
    logger.info(f"Test 2 (Session): {'PASSED' if test2_result else 'FAILED'}")
    
    overall_result = test1_result or test2_result  # Pass if any test succeeds
    logger.info(f"Overall result: {'PASSED' if overall_result else 'FAILED'}")
    
    return overall_result


if __name__ == "__main__":
    # Run the tests
    result = asyncio.run(main())
    
    # Exit with appropriate code
    sys.exit(0 if result else 1)