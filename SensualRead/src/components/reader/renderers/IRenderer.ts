/**
 * IRenderer - Interface for file renderers
 *
 * Strategy pattern: Each file type (EPUB, PDF, CBZ, TXT)
 * implements this interface for consistent rendering behavior.
 */

export interface BookMetadata {
  title: string;
  author?: string;
  cover?: string;       // Base64 or URI
  totalPages: number;
  currentPage: number;
  language?: string;
  publisher?: string;
  description?: string;
}

export interface PageContent {
  text: string;           // Plain text for analysis
  html?: string;          // HTML if available (EPUB)
  images?: string[];      // Image URIs on this page
  pageNumber: number;
}

export type ContentChangeCallback = (content: PageContent) => void;

export interface IRenderer {
  /**
   * Check if this renderer supports the given file
   * @param filePath - Path to the file
   */
  canRender(filePath: string): boolean;

  /**
   * Load a book file
   * @param filePath - Path to the file to load
   */
  load(filePath: string): Promise<void>;

  /**
   * Unload current book and free resources
   */
  unload(): void;

  /**
   * Check if a book is currently loaded
   */
  isLoaded(): boolean;

  /**
   * Get book metadata
   */
  getMetadata(): BookMetadata | null;

  /**
   * Get current page content
   */
  getCurrentContent(): PageContent | null;

  /**
   * Navigate to next page
   * @returns true if navigation successful
   */
  nextPage(): boolean;

  /**
   * Navigate to previous page
   * @returns true if navigation successful
   */
  prevPage(): boolean;

  /**
   * Go to specific page
   * @param page - Page number (1-indexed)
   */
  goToPage(page: number): boolean;

  /**
   * Get current page number
   */
  getCurrentPage(): number;

  /**
   * Get total page count
   */
  getTotalPages(): number;

  /**
   * Subscribe to content changes (page turns)
   * @param callback - Called when content changes
   * @returns Unsubscribe function
   */
  onContentChange(callback: ContentChangeCallback): () => void;

  /**
   * Get supported file extensions for this renderer
   */
  getSupportedExtensions(): string[];

  /**
   * Get text content of a specific page without navigating to it.
   * Returns null if pageNumber is out of range or renderer is not loaded.
   */
  getPageText(pageNumber: number): string | null;

  /**
   * Recalculate pagination with new chars-per-page value.
   * Preserves approximate reading position via progress ratio.
   * Clamped to 500–5000 chars.
   */
  setCharsPerPage(chars: number): void;

  /**
   * Get the character offset in the full text where the current page starts.
   * Returns 0 if not loaded or offset tracking not available.
   */
  getCurrentCharOffset(): number;

  /**
   * Navigate to the page that contains the given character offset.
   * Falls back to page 1 if offset not found. Returns true on success.
   */
  goToCharOffset(offset: number): boolean;
}
