import "./globals.css";
import type { Metadata } from "next";
import { CommandProvider } from "./command/CommandProvider";
import { Nav } from "./Nav";

export const metadata: Metadata = {
  title: "Firecrawl Traces",
  description: "Make the opaque legible — observable retrieval (search) and browser flows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <CommandProvider>
          <Nav />
          {children}
        </CommandProvider>
      </body>
    </html>
  );
}
