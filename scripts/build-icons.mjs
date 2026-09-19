import { mkdir, writeFile } from "node:fs/promises";
import sharp from "sharp";

await mkdir("build", { recursive: true });
await sharp("public/icon.svg").resize(512, 512).png().toFile("build/icon.png");
await sharp("public/icon.svg").resize(512, 512).png().toFile("public/icon.png");
// ICO directory entries contain PNG images, supported by Windows Vista and later.
const sizes = [16, 24, 32, 48, 64, 128, 256];
const images = await Promise.all(
  sizes.map((size) =>
    sharp("public/icon.svg").resize(size, size).png().toBuffer(),
  ),
);
const header = Buffer.alloc(6 + sizes.length * 16);
header.writeUInt16LE(1, 2);
header.writeUInt16LE(sizes.length, 4);
let offset = header.length;
images.forEach((png, i) => {
  const entry = 6 + i * 16;
  header[entry] = sizes[i] % 256;
  header[entry + 1] = sizes[i] % 256;
  header.writeUInt16LE(1, entry + 4);
  header.writeUInt16LE(32, entry + 6);
  header.writeUInt32LE(png.length, entry + 8);
  header.writeUInt32LE(offset, entry + 12);
  offset += png.length;
});
await writeFile("build/icon.ico", Buffer.concat([header, ...images]));
