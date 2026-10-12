import type { Metadata } from 'next';
import 'maplibre-gl/dist/maplibre-gl.css';
import './globals.css';
export const metadata:Metadata={title:'RunRoute — Temukan rute lari',description:'Temukan alternatif rute lari nyata berdasarkan jarak dan preferensi elevasi.'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="id"><body>{children}</body></html>}
