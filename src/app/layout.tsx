import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Контур — продуктовая отчетность",
  description: "Единое пространство квартальной отчетности продуктовых команд",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  );
}
