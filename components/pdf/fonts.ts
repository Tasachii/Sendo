import path from "path";
import { Font } from "@react-pdf/renderer";

// Register Sarabun (official Thai government document font) once per process so
// PDFs render Thai correctly and offline. Files live in public/fonts.
let registered = false;

export function registerThaiFont() {
  if (registered) return;
  const dir = path.join(process.cwd(), "public", "fonts");
  Font.register({
    family: "Sarabun",
    fonts: [
      { src: path.join(dir, "Sarabun-Regular.ttf"), fontWeight: "normal" },
      { src: path.join(dir, "Sarabun-Medium.ttf"), fontWeight: "medium" },
      { src: path.join(dir, "Sarabun-Bold.ttf"), fontWeight: "bold" },
    ],
  });
  // Thai has no word spaces; disable hyphenation so words aren't broken oddly.
  Font.registerHyphenationCallback((word) => [word]);
  registered = true;
}
