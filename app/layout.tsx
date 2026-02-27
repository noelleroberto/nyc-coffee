import type { Metadata } from "next";
import NavLinks from "./components/NavLinks";
import "./globals.css";

export const metadata: Metadata = {
  title: "NYC Coffee",
  description: "Order from NYC Coffee — 512 W 43rd St, New York",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-gray-50">
        <nav className="bg-gradient-to-r from-sky-500 to-blue-600 text-white shadow-md">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-14">
              <div className="flex items-center gap-2">
                <span className="text-xl font-bold tracking-tight">
                  NYC Coffee
                </span>
                <span className="text-sky-100 text-sm hidden sm:inline">
                  512 W 43rd St
                </span>
              </div>
              <NavLinks />
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
