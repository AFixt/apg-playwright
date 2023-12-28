/**
 * Notes:
 * 
 * This is a sample test file for testing accordions. You can use this as a template for your own tests.
 * 
 * Replace the following values with the actual IDs of the accordion elements:
 * - accordion-header-1
 * - accordion-header-2
 * - accordion-header-last
 * - accordion-panel-1
 * - accordion-panel-2
 * - accordion-panel-last
 * - expected-next-focus-element-id
 * - expected-previous-focus-element-id
 * 
 * Replace the startLocation with the actual URL of the page where the accordion is to be found for testing
 */

const { test, expect } = require("@playwright/test");

const startLocation = "https://yourwebsite.com/accordion";

test.describe("Expanding and Collapsing Accordion Panels", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(startLocation);
  });

  test("should expand and collapse accordion panels appropriately", async ({ page }) => {
    // Check if the first panel is collapsed initially
    await expect(page.locator("#accordion-panel-1")).toBeHidden();

    // Expand the first panel and check if it's visible
    await page.click("#accordion-header-1");
    await expect(page.locator("#accordion-panel-1")).toBeVisible();

    // Optionally, check if other panels are collapsed (if only one panel is allowed)
    await expect(page.locator("#accordion-panel-2")).toBeHidden();

    // Collapse the first panel and check if it's hidden
    await page.click("#accordion-header-1");
    await expect(page.locator("#accordion-panel-1")).toBeHidden();
  });
});

test.describe("Keyboard Navigation within the Accordion", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(startLocation);
    await page.focus("#accordion-header-1");
  });

  test("should allow keyboard navigation", async ({ page }) => {
    // Test 'Tab' key navigation
    await page.keyboard.press("Tab");
    // Verify that focus has moved to the next element
    await expect(page.locator(":focus")).toHaveId("expected-next-focus-element-id");

    // Test 'Shift+Tab' key navigation
    await page.keyboard.press("Shift+Tab");
    // Verify that focus has moved to the previous element
    await expect(page.locator(":focus")).toHaveId("expected-previous-focus-element-id");

    // Test 'Down Arrow' key navigation
    await page.keyboard.press("ArrowDown");
    // Verify that focus has moved to the next accordion header
    await expect(page.locator(":focus")).toHaveId("accordion-header-2");

    // Test 'Up Arrow' key navigation
    await page.keyboard.press("ArrowUp");
    // Verify that focus has moved to the previous accordion header
    await expect(page.locator(":focus")).toHaveId("accordion-header-1");

    // Test 'Home' key navigation
    await page.keyboard.press("Home");
    // Verify that focus has moved to the first accordion header
    await expect(page.locator(":focus")).toHaveId("accordion-header-1");

    // Test 'End' key navigation
    await page.keyboard.press("End");
    // Verify that focus has moved to the last accordion header
    await expect(page.locator(":focus")).toHaveId("accordion-header-last"); // Replace with the actual ID of the last header
  });
});

test.describe("ARIA Roles, States, and Properties of Accordion Elements", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(startLocation);
  });

  test("should have appropriate ARIA attributes", async ({ page }) => {
    // Check ARIA roles, states, and properties
    const header = page.locator("#accordion-header-1");
    await expect(header).toHaveAttribute("role", "button");
    await expect(header).toHaveAttribute("aria-expanded", /true|false/);
    await expect(header).toHaveAttribute("aria-controls", "accordion-panel-1");

    // Check the 'heading' role and 'aria-level'
    const heading = page.locator("#accordion-header-1 >> xpath=ancestor::heading");
    await expect(heading).toHaveAttribute("role", "heading");
    await expect(heading).toHaveAttribute("aria-level", /\d+/);

    // Check for 'aria-disabled' if a panel cannot be collapsed
    // await expect(header).toHaveAttribute('aria-disabled', 'true');

    // Optionally, check for 'region' role in accordion panel
    // const panel = page.locator('#accordion-panel-1');
    // await expect(panel).toHaveAttribute('role', 'region');
  });
});

// This test is only applicable if the accordion has multiple expandable panels
test.describe("Handling Accordions with Multiple Expandable Panels", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto(startLocation);
  });

  test("should handle multiple expandable panels correctly", async ({ page }) => {
    // Expand multiple panels
    await page.click("#accordion-header-1");
    await page.click("#accordion-header-2");

    // Check if multiple panels are visible
    await expect(page.locator("#accordion-panel-1")).toBeVisible();
    await expect(page.locator("#accordion-panel-2")).toBeVisible();

    // Check the use of 'region' role if applicable
    // await expect(page.locator('#accordion-panel-1')).toHaveAttribute('role', 'region');
  });
});
