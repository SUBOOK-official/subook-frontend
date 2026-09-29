import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { supabase } from "@shared-supabase/publicSupabaseClient";
import { listContentThemes } from "@shared-supabase/contentThemesClient";
import ContentContainer from "../ContentContainer";
import { trackSelectContent } from "../../lib/analytics";
import "./ThemeQuickLinks.css";

export default function ThemeQuickLinks() {
  const [themes, setThemes] = useState([]);
  useEffect(() => {
    let cancelled = false;
    const refresh = async () => {
      try { const rows = await listContentThemes(supabase); if (!cancelled) setThemes(rows); }
      catch { /* Keep the last successfully loaded shortcuts. */ }
    };
    void refresh();
    const timer = window.setInterval(refresh, 30000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, []);
  if (!themes.length) return null;
  return <div className="home-theme-links-section"><ContentContainer><nav className="home-theme-links" aria-label="테마별 교재 바로가기">
    {themes.map((theme) => <Link key={theme.id} to={`/themes/${theme.id}`} className="home-theme-links__item" onClick={() => trackSelectContent("home_theme", theme.id)}><span className="home-theme-links__image"><img src={theme.image_url} alt="" loading="lazy" width="72" height="72" /></span><span>{theme.title}</span></Link>)}
  </nav></ContentContainer></div>;
}
