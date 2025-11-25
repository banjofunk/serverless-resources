/**
 * Default banner placeholders for standard IAB (Interactive Advertising Bureau) ad sizes.
 * These SVG placeholders are used when a banner size is missing from an uploaded banner set.
 * Each placeholder is a semi-transparent rectangle matching the standard dimensions.
 */

/**
 * Half Page banner placeholder (300x600 pixels)
 * Also known as "Half Page Ad" or "Large Skyscraper"
 */
export const halfPage = `\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48.9 97.9">
  <path fill="rgba(0,0,0,0.2)" d="M0 0h48.9v97.9H0z" />
</svg>`;

/**
 * Wide Skyscraper banner placeholder (160x600 pixels)
 * Common vertical banner format for sidebar placements
 */
export const wideSkyscraper = `\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 21.1 80.6">
  <path fill="rgba(0,0,0,0.2)" d="M0 0h21.1v80.6H0z" />
</svg>`;

/**
 * Large Rectangle banner placeholder (336x280 pixels)
 * Popular in-content ad format
 */
export const largeRectangle = `\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76.8 63.3">
  <path fill="rgba(0,0,0,0.2)" d="M0 0h76.8v63.3H0z" />
</svg>`;

/**
 * Full Banner placeholder (468x60 pixels)
 * Traditional horizontal banner format
 */
export const fullBanner = `\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 76.8 11.5">
  <path fill="rgba(0,0,0,0.2)" d="M0 0h76.8v11.5H0z" />
</svg>`;

/**
 * Leaderboard banner placeholder (728x90 pixels)
 * Common header/footer banner format
 */
export const leaderboard = `\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 102.7 12.5">
  <path fill="rgba(0,0,0,0.2)" d="M0 0h102.7v12.5H0z" />
</svg>`;

/**
 * Half Banner placeholder (234x60 pixels)
 * Smaller horizontal banner format
 */
export const halfBanner = `\
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 157.4 40.3">
  <path fill="rgba(0,0,0,0.2)" d="M0 0h157.4v40.3H0z" />
</svg>`;
