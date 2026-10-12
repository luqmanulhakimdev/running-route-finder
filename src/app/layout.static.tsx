import type { Metadata } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';

export const metadata: Metadata = {
  title: 'RunRoute — Preview statis',
  description: 'Preview statis RunRoute. Pencarian rute membutuhkan backend aplikasi.',
};

export default function StaticLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id">
      <body>{children}</body>
    </html>
  );
}
