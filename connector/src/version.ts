/**
 * One place, because it was three.
 *
 * The version was written separately in package.json, the uploader and the
 * pairing call, so a bump could easily update the file the hospital downloads
 * while the connector kept reporting the old number to the server — and the
 * settings screen would then show a version nobody is running.
 */
export const VERSION = '1.0.7'
