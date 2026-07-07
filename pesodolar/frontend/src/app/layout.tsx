import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PesoDólar · Monitor FX Colombia",
  description: "TRM diaria, forwards COP/USD, devaluación implícita y proyecciones de tasas BanRep y usura",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
