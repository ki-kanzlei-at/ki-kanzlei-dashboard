"use client";

import { useState, useEffect } from "react";
import { toast } from "sonner";
import { Save, Loader2, Palette, Type, Image, Globe, RotateCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card, CardContent, CardDescription, CardHeader, CardTitle,
} from "@/components/ui/card";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";

interface BrandSettings {
  company_name: string;
  website: string;
  primary_color: string;
  accent_color: string;
  dark_bg: string;
  text_color: string;
  muted_color: string;
  font_family: string;
  font_cdn_url: string;
  logo_svg: string;
  tagline: string;
}

const DEFAULTS: BrandSettings = {
  company_name: "KI Kanzlei",
  website: "ki-kanzlei.at",
  primary_color: "#3884EE",
  accent_color: "#42B5EF",
  dark_bg: "#0E131A",
  text_color: "#1C242F",
  muted_color: "#707C8E",
  font_family: "Satoshi",
  font_cdn_url: "https://fonts.cdnfonts.com/css/satoshi",
  logo_svg: `<svg width="26" height="26" viewBox="0 0 28 28" fill="none"><defs><linearGradient id="kg" x1="0" y1="0" x2="28" y2="28" gradientUnits="userSpaceOnUse"><stop offset="0%" stop-color="#3884EE"/><stop offset="100%" stop-color="#42B5EF"/></linearGradient></defs><rect width="28" height="28" rx="6" fill="url(#kg)"/><rect x="6" y="7" width="3" height="14" fill="white"/><path d="M9 14L16.5 7H20L13 14L20 21H16.5L9 14Z" fill="white"/><rect x="21" y="7" width="3" height="14" fill="white"/></svg>`,
  tagline: "",
};

export default function BrandingSettings() {
  const [brand, setBrand] = useState<BrandSettings>(DEFAULTS);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch("/api/settings");
        const json = await res.json();
        if (json.data?.brand_settings) {
          setBrand({ ...DEFAULTS, ...json.data.brand_settings });
        }
      } catch {
        // silent
      } finally {
        setLoading(false);
      }
    }
    load();
  }, []);

  const update = (key: keyof BrandSettings, value: string) => {
    setBrand((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch("/api/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brand_settings: brand }),
      });
      if (!res.ok) throw new Error();
      toast.success("Branding gespeichert");
    } catch {
      toast.error("Fehler beim Speichern");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setBrand(DEFAULTS);
    toast.info("Auf Standard-Branding zurückgesetzt (noch nicht gespeichert)");
  };

  if (loading) {
    return (
      <div className="space-y-4">
        {[1, 2, 3].map((i) => (
          <Card key={i} className="animate-pulse">
            <CardHeader><div className="h-4 w-32 bg-muted rounded" /></CardHeader>
            <CardContent><div className="h-20 bg-muted rounded" /></CardContent>
          </Card>
        ))}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Preview */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="text-base">Vorschau</CardTitle>
              <CardDescription>So erscheint dein Branding in Social-Media-Posts</CardDescription>
            </div>
            <Badge variant="outline" className="text-xs">Live</Badge>
          </div>
        </CardHeader>
        <CardContent>
          <div
            className="rounded-lg p-6 flex flex-col items-center gap-4 border"
            style={{ background: `linear-gradient(135deg, ${brand.primary_color}, ${brand.accent_color})` }}
          >
            {/* Logo preview */}
            <div className="flex items-center gap-2">
              {brand.logo_svg && (
                <div dangerouslySetInnerHTML={{ __html: brand.logo_svg }} />
              )}
              <span
                style={{
                  fontFamily: `'${brand.font_family}', sans-serif`,
                  fontWeight: 700,
                  fontSize: "16px",
                  color: "#ffffff",
                }}
              >
                {brand.company_name || "Firmenname"}
              </span>
            </div>
            {brand.tagline && (
              <span style={{ color: "rgba(255,255,255,0.8)", fontSize: "12px" }}>
                {brand.tagline}
              </span>
            )}
            {/* Color swatches */}
            <div className="flex gap-2 mt-2">
              {[
                { c: brand.primary_color, l: "Primary" },
                { c: brand.accent_color, l: "Accent" },
                { c: brand.dark_bg, l: "Dark" },
                { c: brand.text_color, l: "Text" },
              ].map((s) => (
                <div key={s.l} className="flex flex-col items-center gap-1">
                  <div
                    className="h-8 w-8 rounded-md border-2 border-white/30"
                    style={{ background: s.c }}
                  />
                  <span className="text-[9px] text-white/70">{s.l}</span>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Company info */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Globe className="h-4 w-4" />
            Unternehmen
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Firmenname</Label>
              <Input
                value={brand.company_name}
                onChange={(e) => update("company_name", e.target.value)}
                placeholder="KI Kanzlei"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm">Website</Label>
              <Input
                value={brand.website}
                onChange={(e) => update("website", e.target.value)}
                placeholder="ki-kanzlei.at"
                className="mt-1"
              />
            </div>
          </div>
          <div>
            <Label className="text-sm">Tagline / Slogan</Label>
            <Input
              value={brand.tagline}
              onChange={(e) => update("tagline", e.target.value)}
              placeholder="z.B. KI-Automatisierung für Kanzleien"
              className="mt-1"
            />
          </div>
        </CardContent>
      </Card>

      {/* Colors */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Palette className="h-4 w-4" />
            Farben
          </CardTitle>
          <CardDescription>Die Hauptfarben deiner Marke für Social-Media-Posts</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { key: "primary_color" as const, label: "Primärfarbe", desc: "CTAs, Akzente" },
              { key: "accent_color" as const, label: "Akzentfarbe", desc: "Gradient-Ende" },
              { key: "dark_bg" as const, label: "Dunkler Hintergrund", desc: "Dark-Mode Slides" },
              { key: "text_color" as const, label: "Textfarbe", desc: "Dunkler Text" },
              { key: "muted_color" as const, label: "Gedämpft", desc: "Subtexte, Labels" },
            ].map((field) => (
              <div key={field.key} className="flex items-center gap-3">
                <div className="relative">
                  <input
                    type="color"
                    value={brand[field.key]}
                    onChange={(e) => update(field.key, e.target.value)}
                    className="h-10 w-10 rounded-md border cursor-pointer p-0.5"
                  />
                </div>
                <div className="flex-1 min-w-0">
                  <Label className="text-sm">{field.label}</Label>
                  <div className="flex items-center gap-2 mt-0.5">
                    <Input
                      value={brand[field.key]}
                      onChange={(e) => update(field.key, e.target.value)}
                      className="h-7 text-xs font-mono"
                      maxLength={7}
                    />
                  </div>
                  <p className="text-[10px] text-muted-foreground mt-0.5">{field.desc}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Typography */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Type className="h-4 w-4" />
            Typografie
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid sm:grid-cols-2 gap-4">
            <div>
              <Label className="text-sm">Font-Name</Label>
              <Input
                value={brand.font_family}
                onChange={(e) => update("font_family", e.target.value)}
                placeholder="Satoshi"
                className="mt-1"
              />
            </div>
            <div>
              <Label className="text-sm">Font CDN URL</Label>
              <Input
                value={brand.font_cdn_url}
                onChange={(e) => update("font_cdn_url", e.target.value)}
                placeholder="https://fonts.cdnfonts.com/css/satoshi"
                className="mt-1"
              />
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Logo */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Image className="h-4 w-4" />
            Logo (SVG)
          </CardTitle>
          <CardDescription>
            Füge dein Logo als SVG-Code ein. Wird inline in jeden Post eingebettet.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <textarea
            value={brand.logo_svg}
            onChange={(e) => update("logo_svg", e.target.value)}
            rows={4}
            className="w-full rounded-md border bg-background px-3 py-2 text-xs font-mono resize-none focus:outline-none focus:ring-2 focus:ring-ring"
            placeholder='<svg width="26" height="26" viewBox="0 0 28 28">...</svg>'
          />
          {brand.logo_svg && (
            <div className="mt-3 flex items-center gap-3">
              <span className="text-xs text-muted-foreground">Vorschau:</span>
              <div dangerouslySetInnerHTML={{ __html: brand.logo_svg }} />
            </div>
          )}
        </CardContent>
      </Card>

      {/* Actions */}
      <div className="flex items-center gap-3">
        <Button onClick={handleSave} disabled={saving} className="gap-1.5">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          {saving ? "Speichern..." : "Branding speichern"}
        </Button>
        <Button variant="outline" onClick={handleReset} className="gap-1.5">
          <RotateCcw className="h-4 w-4" />
          Zurücksetzen
        </Button>
      </div>
    </div>
  );
}
