import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@open-design/components';
import type { BrandDetailResponse, BrandFontSpec } from '@open-design/contracts';
import { useT } from '../i18n';
import { navigate } from '../router';
import styles from './BrandDetailView.module.css';

interface Props {
  brandId: string;
}

function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || rawUrl;
  }
}

type LoadState =
  | { status: 'loading' }
  | { status: 'ready'; detail: BrandDetailResponse }
  | { status: 'not-found' };

// Logo resolution walks a fallback chain: the brand's own stored logo first,
// then Google's favicon service for the source domain, and finally a letter
// tile. Each step advances only when the previous image fails to load.
type LogoStage = 'brand' | 'favicon' | 'letter';

export function BrandDetailView({ brandId }: Props) {
  const t = useT();
  const [load, setLoad] = useState<LoadState>({ status: 'loading' });
  const [busy, setBusy] = useState(false);
  const [logoStage, setLogoStage] = useState<LogoStage>('brand');

  const fetchDetail = useCallback(async () => {
    try {
      const resp = await fetch(`/api/brands/${encodeURIComponent(brandId)}`, {
        cache: 'no-store',
      });
      if (resp.status === 404) {
        setLoad({ status: 'not-found' });
        return;
      }
      if (!resp.ok) {
        setLoad({ status: 'not-found' });
        return;
      }
      const detail = (await resp.json()) as BrandDetailResponse;
      setLoad({ status: 'ready', detail });
    } catch {
      setLoad({ status: 'not-found' });
    }
  }, [brandId]);

  useEffect(() => {
    setLoad({ status: 'loading' });
    setLogoStage('brand');
    void fetchDetail();
  }, [fetchDetail]);

  const goBack = useCallback(() => {
    navigate({ kind: 'home', view: 'brands' });
  }, []);

  const detail = load.status === 'ready' ? load.detail : null;
  const meta = detail?.meta ?? null;
  const brand = detail?.brand ?? null;
  const host = meta ? hostnameOf(meta.sourceUrl) : '';
  const name = brand?.name?.trim() || host;
  const refining = meta?.status === 'extracting';

  const logoSrc =
    logoStage === 'brand'
      ? `/api/brands/${encodeURIComponent(brandId)}/logo`
      : logoStage === 'favicon' && host
        ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=128`
        : null;

  const advanceLogo = useCallback(() => {
    setLogoStage((stage) => {
      if (stage === 'brand') return 'favicon';
      return 'letter';
    });
  }, []);

  const useInChat = useCallback(async () => {
    if (!meta?.designSystemId || busy) return;
    setBusy(true);
    try {
      // The brand registered a `user:<id>` design system; reuse the existing
      // design-system apply flow by writing the global default into app-config.
      await fetch('/api/app-config', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ designSystemId: meta.designSystemId }),
      });
      navigate({ kind: 'home', view: 'home' });
    } catch {
      setBusy(false);
    }
  }, [meta?.designSystemId, busy]);

  const openProject = useCallback(() => {
    if (!meta?.projectId) return;
    navigate({ kind: 'project', projectId: meta.projectId, fileName: null, conversationId: null });
  }, [meta?.projectId]);

  const deleteBrand = useCallback(async () => {
    if (busy) return;
    const ok = window.confirm(`Delete "${name}"? This removes the brand and its design system.`);
    if (!ok) return;
    setBusy(true);
    try {
      await fetch(`/api/brands/${encodeURIComponent(brandId)}`, { method: 'DELETE' });
      navigate({ kind: 'home', view: 'brands' });
    } catch {
      setBusy(false);
    }
  }, [busy, brandId, name]);

  const colors = brand?.colors ?? [];
  const fonts = useMemo<{ font: BrandFontSpec; label: string }[]>(() => {
    if (!brand) return [];
    const out: { font: BrandFontSpec; label: string }[] = [];
    if (brand.typography.display) out.push({ font: brand.typography.display, label: 'Display' });
    if (brand.typography.body) out.push({ font: brand.typography.body, label: 'Body' });
    if (brand.typography.mono) out.push({ font: brand.typography.mono, label: 'Mono' });
    return out;
  }, [brand]);
  const adjectives = brand?.voice?.adjectives ?? [];
  const aesthetic = brand?.imagery?.style?.trim() || brand?.voice?.tone?.trim() || '';

  return (
    <div className={styles.root} data-testid="brand-detail">
      <div className={styles.topbar}>
        <button type="button" className={styles.back} onClick={goBack} data-testid="brand-detail-back">
          <BackGlyph />
          <span>{t('brandDetail.back')}</span>
        </button>
      </div>

      {load.status === 'loading' ? (
        <div className={styles.loading} aria-busy="true" />
      ) : load.status === 'not-found' ? (
        <div className={styles.notFound} data-testid="brand-detail-not-found">
          {t('brandDetail.notFound')}
        </div>
      ) : (
        <>
          <header className={styles.header}>
            <div className={styles.headerLeft}>
              <div className={styles.headerLogo}>
                {logoSrc ? (
                  <img
                    className={styles.headerLogoImg}
                    src={logoSrc}
                    alt=""
                    referrerPolicy="no-referrer"
                    onError={advanceLogo}
                  />
                ) : (
                  <span className={styles.headerLogoFallback} aria-hidden>
                    {name.slice(0, 1).toUpperCase()}
                  </span>
                )}
              </div>
              <div className={styles.headerText}>
                <div className={styles.headerTitleRow}>
                  <h1 className={styles.headerName}>{name}</h1>
                  {refining ? (
                    <span className={styles.refining} role="status">
                      {t('brandDetail.refining')}
                    </span>
                  ) : null}
                </div>
                {brand?.tagline ? (
                  <p className={styles.headerTagline}>{brand.tagline}</p>
                ) : null}
                {host ? (
                  <a
                    className={styles.headerDomain}
                    href={meta?.sourceUrl}
                    target="_blank"
                    rel="noreferrer noopener"
                  >
                    {host}
                    <ExternalGlyph />
                  </a>
                ) : null}
              </div>
            </div>
            <div className={styles.headerActions}>
              <Button
                variant="primary"
                onClick={() => void useInChat()}
                disabled={busy || !meta?.designSystemId}
                data-testid="brand-detail-use"
              >
                {t('brandDetail.useInChat')}
              </Button>
              {meta?.projectId ? (
                <Button
                  variant="ghost"
                  onClick={openProject}
                  disabled={busy}
                  data-testid="brand-detail-open-project"
                >
                  Open project
                </Button>
              ) : null}
              <Button
                variant="ghost"
                onClick={() => void deleteBrand()}
                disabled={busy}
                data-testid="brand-detail-delete"
              >
                {t('brandDetail.delete')}
              </Button>
            </div>
          </header>

          {brand?.description ? (
            <section className={styles.card} aria-label={t('brandDetail.identity')}>
              <h2 className={styles.cardTitle}>{t('brandDetail.identity')}</h2>
              <p className={styles.description}>{brand.description}</p>
            </section>
          ) : null}

          {/* ── Typography ─────────────────────────────────────────── */}
          {fonts.length > 0 ? (
            <section className={styles.card} aria-label={t('brandDetail.fonts')}>
              <h2 className={styles.cardTitle}>{t('brandDetail.fonts')}</h2>
              <div className={styles.fontList}>
                {fonts.map(({ font, label }) => (
                  <div key={`${label}-${font.family}`} className={styles.fontItem}>
                    <div className={styles.fontItemHead}>
                      <span className={styles.fontRole}>{label}</span>
                      <span className={styles.fontFamily}>
                        {font.family}
                        {font.weights.length > 0 ? (
                          <span className={styles.fontWeights}> · {font.weights.join('/')}</span>
                        ) : null}
                      </span>
                    </div>
                    <span
                      className={styles.fontSpecimen}
                      style={{
                        fontFamily: `'${font.family}', ${font.fallbacks.join(', ') || 'sans-serif'}`,
                      }}
                    >
                      {label === 'Mono' ? 'const brand = await extract(url);' : name}
                    </span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* ── Palette ────────────────────────────────────────────── */}
          {colors.length > 0 ? (
            <section className={styles.card} aria-label={t('brandDetail.colors')}>
              <h2 className={styles.cardTitle}>{t('brandDetail.colors')}</h2>
              <div className={styles.colorGrid}>
                {colors.map((c, i) => (
                  <div key={`${c.role}-${i}`} className={styles.colorCard}>
                    <span className={styles.colorSwatch} style={{ background: c.hex }}>
                      <span className={styles.colorHex}>{c.hex}</span>
                    </span>
                    <span className={styles.colorName}>{c.name || c.role}</span>
                  </div>
                ))}
              </div>
            </section>
          ) : null}

          {/* ── Voice & aesthetic ──────────────────────────────────── */}
          {adjectives.length > 0 || aesthetic ? (
            <section className={styles.card} aria-label={t('brandDetail.voice')}>
              <h2 className={styles.cardTitle}>{t('brandDetail.voice')}</h2>
              {adjectives.length > 0 ? (
                <div className={styles.subsection}>
                  <h3 className={styles.subTitle}>{t('brandDetail.tone')}</h3>
                  <div className={styles.pills}>
                    {adjectives.map((adj, i) => (
                      <span key={`${adj}-${i}`} className={styles.pill}>
                        {adj}
                      </span>
                    ))}
                  </div>
                </div>
              ) : null}
              {aesthetic ? (
                <div className={styles.subsection}>
                  <h3 className={styles.subTitle}>{t('brandDetail.aesthetic')}</h3>
                  <p className={styles.aesthetic}>{aesthetic}</p>
                </div>
              ) : null}
            </section>
          ) : null}
        </>
      )}
    </div>
  );
}

function BackGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="14" height="14" fill="none" aria-hidden>
      <path
        d="M10 3.5L5.5 8l4.5 4.5"
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

function ExternalGlyph() {
  return (
    <svg viewBox="0 0 16 16" width="11" height="11" fill="none" aria-hidden>
      <path
        d="M6 3.5h6.5V10M12.5 3.5L6.5 9.5M9 3.5H4.5a1 1 0 0 0-1 1V12a1 1 0 0 0 1 1h7.5a1 1 0 0 0 1-1V8"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
