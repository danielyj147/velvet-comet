import "./globals.css";
import type { Metadata } from "next";
import { CommandProvider } from "./command/CommandProvider";
import { Nav } from "./Nav";
import { Bubbles } from "@/components/Bubbles";
import { Onboarding } from "@/components/Onboarding";

export const metadata: Metadata = {
  title: "Spectra — see why, not just what",
  description: "Observable web retrieval and browser flows.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen">
        <Bubbles />
        <CommandProvider>
          <Nav />
          {children}
          <Onboarding />
        </CommandProvider>
      </body>
    </html>
  );
}
