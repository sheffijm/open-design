import { useCallback, useEffect, useMemo, useState } from 'react';
import { Button } from '@open-design/components';
import type { BrandFontSpec, BrandSummary } from '@open-design/contracts';
import { useT } from '../i18n';
import { navigate } from '../router';
import { NewBrandModal } from './NewBrandModal';
import styles from './BrandsTab.module.css';

// Best-effort hostname for the brand's domain line. Brand names come from the
// extracted kit, but the source URL is always present in meta, so even an
// in-flight / failed brand shows a recognizable label.
function hostnameOf(rawUrl: string): string {
  try {
    return new URL(rawUrl).hostname.replace(/^www\./, '');
  } catch {
    return rawUrl.replace(/^https?:\/\//, '').replace(/^www\./, '').split('/')[0] || rawUrl;
  }
}

async function fetchBrands(): Promise<BrandSummary[]> {
  try {
    const resp = await fetch('/api/brands', { cache: 'no-store' });
    if (!resp.ok) return [];
    const data = (await resp.json()) as { brands?: BrandSummary[] };
    return Array.isArray(data?.brands) ? data.brands : [];
  } catch {
    return [];
  }
}

export function BrandsTab() {
  const t = useT();
  const [brands, setBrands] = useState<BrandSummary[] | null>(null);
  const [query, setQuery] = useState('');
  const [modalOpen, setModalOpen] = useState(false);
  const [selectedBrandId, setSelectedBrandId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const next = await fetchBrands();
    setBrands(next);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const filtered = useMemo(() => {
    const list = brands ?? [];
    const q = query.trim().toLowerCase();
    if (!q) return list;
    return list.filter((b) => {
      const name = b.brand?.name ?? '';
      const host = hostnameOf(b.meta.sourceUrl);
      return name.toLowerCase().includes(q) || host.toLowerCase().includes(q);
    });
  }, [brands, query]);

  // Default the preview to the first brand on load, and keep the selection
  // valid as the list refreshes (e.g. a brand finishes extracting or is
  // removed). Only fall back to the first entry when the current pick is gone.
  useEffect(() => {
    const list = brands ?? [];
    if (list.length === 0) {
      setSelectedBrandId(null);
      return;
    }
    setSelectedBrandId((cur) => {
      if (cur && list.some((b) => b.meta.id === cur)) return cur;
      return list[0].meta.id;
    });
  }, [brands]);

  const selected = useMemo(() => {
    if (!selectedBrandId) return null;
    return (brands ?? []).find((b) => b.meta.id === selectedBrandId) ?? null;
  }, [brands, selectedBrandId]);

  const openBrand = useCallback((id: string) => {
    navigate({ kind: 'brand-detail', brandId: id });
  }, []);

  const handleCreated = useCallback(
    (_brandId: string, projectId: string, conversationId: string) => {
      setModalOpen(false);
      void refresh();
      try {
        // Auto-send the seeded extraction prompt so the agent starts the moment
        // the project opens (same pattern as plugin-share / design-system handoff).
        window.sessionStorage.setItem(`od:auto-send-first:${projectId}`, '1');
      } catch {
        // Private-mode storage failures should not block navigation.
      }
      navigate({ kind: 'project', projectId, fileName: null, conversationId });
    },
    [refresh],
  );

  const isEmpty = brands !== null && (brands ?? []).length === 0;

  return (
    <div className={styles.root} data-testid="brands-tab">
      <aside className={styles.sidebar}>
        <div className={styles.sidebarHead}>
          <h1 className={styles.title}>{t('brand.libraryTitle')}</h1>
          <Button
            variant="primary"
            onClick={() => setModalOpen(true)}
            data-testid="brands-new"
            className={styles.newBtn}
          >
            {t('brand.newBrand')}
          </Button>
        </div>

        <div className={styles.searchWrap}>
          <SearchGlyph />
          <input
            type="search"
            className={styles.search}
            placeholder={t('brand.searchPlaceholder')}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            data-testid="brands-search"
          />
        </div>

        <div className={styles.list} data-testid="brands-list">
          {brands === null ? (
            <div className={styles.listLoading} aria-busy="true">
              {Array.from({ length: 4 }).map((_, i) => (
                <span key={`sk-${i}`} className={styles.skeletonRow} />
              ))}
            </div>
          ) : isEmpty ? (
            <div className={styles.sidebarEmpty} data-testid="brands-empty">
              <p className={styles.sidebarEmptyText}>{t('brand.empty')}</p>
            </div>
          ) : filtered.length === 0 ? (
            <div className={styles.sidebarEmpty}>
              <p className={styles.sidebarEmptyText}>{t('brand.empty')}</p>
            </div>
          ) : (
            filtered.map((summary) => (
              <BrandListItem
                key={summary.meta.id}
                summary={summary}
                active={summary.meta.id === selectedBrandId}
                onSelect={setSelectedBrandId}
              />
            ))
          )}
        </div>
      </aside>

      <section className={styles.preview} data-testid="brands-preview">
        {selected ? (
          <BrandPreview key={selected.meta.id} summary={selected} onOpen={openBrand} />
        ) : (
          <div className={styles.previewEmpty}>
            <span className={styles.previewEmptyMark} aria-hidden>
              <SparkGlyph />
            </span>
            <p className={styles.previewEmptyText}>{t('brand.previewEmpty')}</p>
          </div>
        )}
      </section>

      <NewBrandModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        onCreated={handleCreated}
      />
    </div>
  );
}

// ─── Logo with fallback chain ────────────────────────────────────────
//
// The brand's own stored logo first, then Google's favicon service for the
// source domain, and finally a monogram tile. Each step advances only when the
// previous image fails to load. `faviconSize` lets the list (64) and the
// preview cover (128) request appropriately-scaled favicons.
type LogoStage = 'brand' | 'favicon' | 'letter';

interface BrandLogoProps {
  id: string;
  host: string;
  name: string;
  faviconSize: number;
  className?: string;
  fallbackClassName: string;
}

function BrandLogo({ id, host, name, faviconSize, className, fallbackClassName }: BrandLogoProps) {
  const [stage, setStage] = useState<LogoStage>('brand');

  useEffect(() => {
    setStage('brand');
  }, [id]);

  const src =
    stage === 'brand'
      ? `/api/brands/${encodeURIComponent(id)}/logo`
      : stage === 'favicon' && host
        ? `https://www.google.com/s2/favicons?domain=${encodeURIComponent(host)}&sz=${faviconSize}`
        : null;

  const advance = useCallback(() => {
    setStage((s) => (s === 'brand' ? 'favicon' : 'letter'));
  }, []);

  if (!src) {
    return (
      <span className={fallbackClassName} aria-hidden>
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      className={className}
      src={src}
      alt=""
      loading="lazy"
      referrerPolicy="no-referrer"
      onError={advance}
    />
  );
}

interface ListItemProps {
  summary: BrandSummary;
  active: boolean;
  onSelect: (id: string) => void;
}

function BrandListItem({ summary, active, onSelect }: ListItemProps) {
  const t = useT();
  const { meta, brand } = summary;
  const host = hostnameOf(meta.sourceUrl);
  const name = brand?.name?.trim() || host;
  const extracting = meta.status === 'extracting';
  const failed = meta.status === 'failed';

  return (
    <button
      type="button"
      className={`${styles.item} ${active ? styles.itemActive : ''}`}
      aria-pressed={active}
      data-testid={`brand-item-${meta.id}`}
      onClick={() => onSelect(meta.id)}
    >
      <span className={styles.itemThumb}>
        <BrandLogo
          id={meta.id}
          host={host}
          name={name}
          faviconSize={64}
          className={styles.itemLogo}
          fallbackClassName={styles.itemLogoFallback}
        />
      </span>
      <span className={styles.itemMeta}>
        <span className={styles.itemName}>{name}</span>
        <span className={styles.itemHost}>{host}</span>
      </span>
      {extracting ? (
        <span
          className={`${styles.statusDot} ${styles.statusDotBusy}`}
          title={t('brand.extracting')}
          aria-label={t('brand.extracting')}
        />
      ) : failed ? (
        <span
          className={`${styles.statusDot} ${styles.statusDotFailed}`}
          title={t('brand.failed')}
          aria-label={t('brand.failed')}
        />
      ) : null}
    </button>
  );
}

interface PreviewProps {
  summary: BrandSummary;
  onOpen: (id: string) => void;
}

function BrandPreview({ summary, onOpen }: PreviewProps) {
  const t = useT();
  const { meta, brand } = summary;
  const host = hostnameOf(meta.sourceUrl);
  const name = brand?.name?.trim() || host;
  const extracting = meta.status === 'extracting';
  const failed = meta.status === 'failed';

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
    <div className={styles.previewInner}>
      <div className={styles.cover}>
        <BrandLogo
          id={meta.id}
          host={host}
          name={name}
          faviconSize={128}
          className={styles.coverLogo}
          fallbackClassName={styles.coverLogoFallback}
        />
      </div>

      <header className={styles.previewHead}>
        <div className={styles.previewHeadText}>
          <div className={styles.previewTitleRow}>
            <h2 className={styles.previewName}>{name}</h2>
            {extracting ? (
              <span className={`${styles.badge} ${styles.badgeBusy}`} role="status">
                {t('brand.extracting')}
              </span>
            ) : failed ? (
              <span className={`${styles.badge} ${styles.badgeFailed}`} role="status">
                {t('brand.failed')}
              </span>
            ) : null}
          </div>
          {brand?.tagline ? <p className={styles.previewTagline}>{brand.tagline}</p> : null}
          {host ? (
            <a
              className={styles.previewDomain}
              href={meta.sourceUrl}
              target="_blank"
              rel="noreferrer noopener"
            >
              {host}
              <ExternalGlyph />
            </a>
          ) : null}
        </div>
        <Button
          variant="ghost"
          onClick={() => onOpen(meta.id)}
          data-testid="brand-preview-open"
        >
          {t('brand.viewDetails')}
        </Button>
      </header>

      {brand?.description ? (
        <section className={styles.section} aria-label={t('brandDetail.identity')}>
          <h3 className={styles.sectionTitle}>{t('brandDetail.identity')}</h3>
          <p className={styles.description}>{brand.description}</p>
        </section>
      ) : null}

      {colors.length > 0 ? (
        <section className={styles.section} aria-label={t('brandDetail.colors')}>
          <h3 className={styles.sectionTitle}>{t('brandDetail.colors')}</h3>
          <div className={styles.colorGrid}>
            {colors.map((c, i) => (
              <div key={`${c.role}-${i}`} className={styles.colorCard}>
                <span className={styles.colorSwatch} style={{ background: c.hex }} />
                <span className={styles.colorName}>{c.name || c.role}</span>
                <span className={styles.colorHex}>{c.hex}</span>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {fonts.length > 0 ? (
        <section className={styles.section} aria-label={t('brandDetail.fonts')}>
          <h3 className={styles.sectionTitle}>{t('brandDetail.fonts')}</h3>
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

      {adjectives.length > 0 || aesthetic ? (
        <section className={styles.section} aria-label={t('brandDetail.voice')}>
          <h3 className={styles.sectionTitle}>{t('brandDetail.voice')}</h3>
          {adjectives.length > 0 ? (
            <div className={styles.subsection}>
              <h4 className={styles.subTitle}>{t('brandDetail.tone')}</h4>
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
              <h4 className={styles.subTitle}>{t('brandDetail.aesthetic')}</h4>
              <p className={styles.aesthetic}>{aesthetic}</p>
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );
}

function SearchGlyph() {
  return (
    <svg className={styles.searchIcon} viewBox="0 0 16 16" width="15" height="15" fill="none" aria-hidden>
      <circle cx="7" cy="7" r="4.5" stroke="currentColor" strokeWidth="1.5" />
      <path d="M10.5 10.5L14 14" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
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

function SparkGlyph() {
  return (
    <svg viewBox="0 0 24 24" width="26" height="26" fill="none" aria-hidden>
      <path
        d="M12 3l1.8 4.9L18.7 9.7 13.8 11.5 12 16.4 10.2 11.5 5.3 9.7l4.9-1.8z"
        stroke="currentColor"
        strokeWidth="1.4"
        strokeLinejoin="round"
      />
    </svg>
  );
}
