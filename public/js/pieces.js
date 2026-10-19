/**
 * Unicode Chess Pieces Set
 * • Witte stukken:
 *   • Koning: ♔ (U+2654)
 *   • Koningin: ♕ (U+2655)
 *   • Toren: ♖ (U+2656)
 *   • Loper: ♗ (U+2657)
 *   • Paard: ♘ (U+2658)
 *   • Pion: ♙ (U+2659)
 * • Zwarte stukken:
 *   • Koning: ♚ (U+265A)
 *   • Koningin: ♛ (U+265B)
 *   • Toren: ♜ (U+265C)
 *   • Loper: ♝ (U+265D)
 *   • Paard: ♞ (U+265E)
 *   • Pion: ♟ (U+265F)
 */
window.PIECE_UNICODE = {
  // White pieces (Witte stukken)
  "K": "\u2654", // ♔ King
  "Q": "\u2655", // ♕ Queen
  "R": "\u2656", // ♖ Rook
  "B": "\u2657", // ♗ Bishop
  "N": "\u2658", // ♘ Knight
  "P": "\u2659", // ♙ Pawn

  // Black pieces (Zwarte stukken)
  "k": "\u265A", // ♚ King
  "q": "\u265B", // ♛ Queen
  "r": "\u265C", // ♜ Rook
  "b": "\u265D", // ♝ Bishop
  "n": "\u265E", // ♞ Knight
  "p": "\u265F"  // ♟ Pawn
};

window.PIECE_SVGS = window.PIECE_UNICODE;
