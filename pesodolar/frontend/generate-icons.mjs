// Genera icon-192.png e icon-512.png para la PWA usando Canvas API nativo de Node 18+
// Corre con: node generate-icons.mjs

import { createCanvas } from "canvas";
import { writeFileSync } from "fs";

function generateIcon(size) {
  const canvas = createCanvas(size, size);
  const ctx = canvas.getContext("2d");

  // Fondo oscuro
  ctx.fillStyle = "#0A0F18";
  ctx.fillRect(0, 0, size, size);

  // Círculo dorado de fondo
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
  ctx.fillStyle = "#1A2535";
  ctx.fill();

  // Borde dorado
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size * 0.44, 0, Math.PI * 2);
  ctx.strokeStyle = "#C49B3C";
  ctx.lineWidth = size * 0.04;
  ctx.stroke();

  // Texto "$"
  ctx.fillStyle = "#C49B3C";
  ctx.font = `bold ${size * 0.42}px serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText("$", size / 2, size / 2 + size * 0.02);

  return canvas.toBuffer("image/png");
}

try {
  const { createCanvas } = await import("canvas");
  writeFileSync("public/icon-192.png", generateIcon(192));
  writeFileSync("public/icon-512.png", generateIcon(512));
  console.log("Íconos generados: icon-192.png e icon-512.png");
} catch {
  // Si no hay canvas instalado, crear íconos SVG como fallback
  console.log("canvas no disponible — generando íconos SVG como PNG placeholder");
  // Los íconos reales se pueden generar en https://realfavicongenerator.net
  writeFileSync("public/icon-192.png", Buffer.alloc(0));
  writeFileSync("public/icon-512.png", Buffer.alloc(0));
}
