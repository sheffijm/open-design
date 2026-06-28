import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { MutableRefObject } from 'react';
import {
  Excalidraw,
  convertToExcalidrawElements,
} from '@excalidraw/excalidraw';
import type {
  AppState,
  BinaryFiles,
  ExcalidrawInitialDataState,
  ExcalidrawImperativeAPI,
  ExcalidrawProps,
} from '@excalidraw/excalidraw/types';
import type { OrderedExcalidrawElement } from '@excalidraw/excalidraw/element/types';
import { Button } from '@open-design/components';
import { useI18n, type Locale } from '../i18n';
import { Icon } from './Icon';
import { readDefaultSketchToolColor } from './sketch-colors';
import {
  emptySketchScene,
  sketchSceneHasContent,
  type ExcalidrawSketchScene,
  type SketchItem,
} from './sketch-model';

const SAVED_VISIBLE_MS = 2000;

interface SketchSceneChangeOptions {
  markDirty?: boolean;
  discardLegacyItems?: boolean;
}

interface Props {
  scene: ExcalidrawSketchScene;
  legacyItems?: SketchItem[];
  hasPreservedRawItems?: boolean;
  onSceneChange: (scene: ExcalidrawSketchScene, options?: SketchSceneChangeOptions) => void;
  onClear?: () => void;
  onSave: (scene?: ExcalidrawSketchScene) => Promise<boolean | void> | boolean | void;
  onCancel?: () => void;
  saving?: boolean;
  dirty?: boolean;
  fileName: string;
}

export function SketchEditor({
  scene,
  legacyItems = [],
  hasPreservedRawItems = false,
  onSceneChange,
  onClear,
  onSave,
  onCancel,
  saving = false,
  dirty = false,
  fileName,
}: Props) {
  const { t, locale } = useI18n();
  const apiRef = useRef<ExcalidrawImperativeAPI | null>(null);
  const [resetNonce, setResetNonce] = useState(0);
  const [showSaved, setShowSaved] = useState(false);
  const [theme, setTheme] = useState(readExcalidrawTheme);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout>>();
  const onSceneChangeRef = useLatestRef(onSceneChange);
  const onClearRef = useLatestRef(onClear);
  const onSaveRef = useLatestRef(onSave);
  const onCancelRef = useLatestRef(onCancel);
  const sceneRef = useLatestRef(scene);
  const fileNameRef = useLatestRef(fileName);
  const skipHydrationChangeRef = useRef(true);
  const lastContentSignatureRef = useRef<string | null>(null);
  const editorInstanceKey = `${fileName}:${resetNonce}`;
  const previousEditorInstanceKeyRef = useRef<string | null>(null);
  const initialDataRef = useRef<{
    key: string;
    value: ExcalidrawInitialDataState;
  } | null>(null);

  if (previousEditorInstanceKeyRef.current !== editorInstanceKey) {
    previousEditorInstanceKeyRef.current = editorInstanceKey;
    skipHydrationChangeRef.current = true;
    lastContentSignatureRef.current = null;
  }

  let initialDataEntry = initialDataRef.current;
  if (!initialDataEntry || initialDataEntry.key !== editorInstanceKey) {
    initialDataEntry = {
      key: editorInstanceKey,
      value: buildInitialData(scene, legacyItems, fileName),
    };
    initialDataRef.current = initialDataEntry;
  }
  const initialData = initialDataEntry.value;

  useEffect(() => {
    const root = document.documentElement;
    const observer = new MutationObserver(() => setTheme(readExcalidrawTheme()));
    observer.observe(root, { attributes: true, attributeFilter: ['data-theme'] });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    return () => clearTimeout(savedTimerRef.current);
  }, []);

  useEffect(() => {
    if (dirty) {
      clearTimeout(savedTimerRef.current);
      setShowSaved(false);
    }
  }, [dirty]);

  const handleChange = useCallback<NonNullable<ExcalidrawProps['onChange']>>((elements, appState, files) => {
    const contentSignature = sceneContentSignature(elements, appState, files);
    if (skipHydrationChangeRef.current) {
      skipHydrationChangeRef.current = false;
      lastContentSignatureRef.current = contentSignature;
      return;
    }
    if (lastContentSignatureRef.current === contentSignature) return;
    lastContentSignatureRef.current = contentSignature;

    onSceneChangeRef.current(sceneFromExcalidraw(elements, appState, files), {
      markDirty: true,
      discardLegacyItems: true,
    });
  }, [onSceneChangeRef]);

  const currentScene = useCallback((): ExcalidrawSketchScene => {
    const api = apiRef.current;
    if (!api) return sceneRef.current;
    return sceneFromExcalidraw(
      api.getSceneElementsIncludingDeleted(),
      api.getAppState(),
      api.getFiles(),
    );
  }, [sceneRef]);

  const handleClear = useCallback(() => {
    if (onClearRef.current) {
      onClearRef.current();
    } else {
      onSceneChangeRef.current(emptySketchScene(fileNameRef.current), {
        markDirty: true,
        discardLegacyItems: true,
      });
    }
    setResetNonce((value) => value + 1);
  }, [fileNameRef, onClearRef, onSceneChangeRef]);

  const handleSave = useCallback(async () => {
    const ok = await onSaveRef.current(currentScene());
    if (ok === false) {
      clearTimeout(savedTimerRef.current);
      setShowSaved(false);
      return;
    }
    setShowSaved(true);
    clearTimeout(savedTimerRef.current);
    savedTimerRef.current = setTimeout(() => setShowSaved(false), SAVED_VISIBLE_MS);
  }, [currentScene, onSaveRef]);

  const handleCancel = useCallback(() => {
    onCancelRef.current?.();
  }, [onCancelRef]);

  const handleExcalidrawAPI = useCallback((api: ExcalidrawImperativeAPI) => {
    apiRef.current = api;
  }, []);

  const excalidrawUIOptions = useMemo<ExcalidrawProps['UIOptions']>(() => ({
    canvasActions: {
      saveToActiveFile: false,
      loadScene: false,
      toggleTheme: false,
      export: { saveFileToDisk: false },
    },
    tools: {
      image: true,
    },
  }), []);

  const canClear = sketchSceneHasContent(scene) || legacyItems.length > 0 || hasPreservedRawItems;
  const canSave = dirty || sketchSceneHasContent(scene) || legacyItems.length > 0 || hasPreservedRawItems;
  const canCancel = Boolean(onCancel);

  const renderTopRightUI = useCallback(() => (
    <div
      className="sketch-excalidraw-actions"
      onPointerDown={(event) => event.stopPropagation()}
    >
      <span className="sketch-name" title={fileName}>
        {fileName}
        {dirty ? ' *' : ''}
      </span>
      <Button variant="ghost" onClick={handleClear} disabled={!canClear}>
        {t('sketch.clear')}
      </Button>
      {canCancel ? (
        <Button variant="ghost" onClick={handleCancel}>
          {t('sketch.close')}
        </Button>
      ) : null}
      <Button
        variant="primary"
        onClick={handleSave}
        disabled={saving || !canSave}
        aria-label={saving ? t('sketch.saving') : showSaved ? t('sketch.saved') : t('common.save')}
      >
        {saving ? t('sketch.saving') : showSaved ? <Icon name="check" size={14} /> : t('common.save')}
      </Button>
    </div>
  ), [canCancel, canClear, canSave, dirty, fileName, handleCancel, handleClear, handleSave, saving, showSaved, t]);

  return (
    <div className="sketch-editor">
      <div className="sketch-canvas-wrap sketch-excalidraw-wrap" data-testid="sketch-excalidraw-editor">
        <Excalidraw
          key={editorInstanceKey}
          initialData={initialData}
          excalidrawAPI={handleExcalidrawAPI}
          onChange={handleChange}
          renderTopRightUI={renderTopRightUI}
          langCode={excalidrawLangCode(locale)}
          theme={theme}
          detectScroll={false}
          handleKeyboardGlobally={false}
          autoFocus
          name={fileName}
          UIOptions={excalidrawUIOptions}
        />
      </div>
    </div>
  );
}

function buildInitialData(
  scene: ExcalidrawSketchScene,
  legacyItems: SketchItem[],
  fileName: string,
): ExcalidrawInitialDataState {
  const convertedLegacyElements = legacyItems.length > 0
    ? convertLegacySketchItemsToExcalidrawElements(legacyItems)
    : null;
  const initialElements = convertedLegacyElements ?? scene.elements;
  return {
    elements: initialElements as ExcalidrawInitialDataState['elements'],
    appState: {
      ...(scene.appState ?? {}),
      name: fileName,
      currentItemStrokeColor: readDefaultSketchToolColor(),
      viewBackgroundColor: typeof scene.appState?.viewBackgroundColor === 'string'
        ? scene.appState.viewBackgroundColor
        : '#ffffff',
    } as ExcalidrawInitialDataState['appState'],
    files: scene.files as ExcalidrawInitialDataState['files'],
    scrollToContent: initialElements.length > 0,
  };
}

function sceneFromExcalidraw(
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): ExcalidrawSketchScene {
  return {
    elements: cloneJson<unknown[]>(elements, []),
    appState: cloneJson<Record<string, unknown> | null>(appState as unknown, null),
    files: cloneJson<Record<string, unknown>>(files, {}),
  };
}

function sceneContentSignature(
  elements: readonly OrderedExcalidrawElement[],
  appState: AppState,
  files: BinaryFiles,
): string {
  const elementSignature = elements.map((element) => {
    if (typeof element.version === 'number') {
      return [
        element.id,
        element.version,
        element.versionNonce,
        element.isDeleted ? 1 : 0,
      ].join(':');
    }
    return stableJsonStringify(element);
  }).join('|');
  const fileSignature = Object.keys(files).sort().map((id) => {
    const file = files[id];
    if (!file || typeof file !== 'object') return id;
    const record = file as Record<string, unknown>;
    const dataURL = record.dataURL;
    return [
      id,
      record.mimeType ?? '',
      record.created ?? '',
      typeof dataURL === 'string' ? dataURL.length : 0,
    ].join(':');
  }).join('|');
  const viewBackgroundColor = typeof appState.viewBackgroundColor === 'string'
    ? appState.viewBackgroundColor
    : '';
  return `${elementSignature}\n${fileSignature}\n${viewBackgroundColor}`;
}

function stableJsonStringify(value: unknown): string {
  try {
    return JSON.stringify(sortJsonValue(value));
  } catch {
    return '';
  }
}

function sortJsonValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortJsonValue);
  if (!value || typeof value !== 'object') return value;
  const record = value as Record<string, unknown>;
  return Object.keys(record).sort().reduce<Record<string, unknown>>((acc, key) => {
    acc[key] = sortJsonValue(record[key]);
    return acc;
  }, {});
}

function useLatestRef<T>(value: T): MutableRefObject<T> {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}

function convertLegacySketchItemsToExcalidrawElements(items: SketchItem[]): unknown[] {
  const skeletons: unknown[] = [];
  for (const item of items) {
    if (item.kind === 'rect') {
      const x = Math.min(item.x, item.x + item.w);
      const y = Math.min(item.y, item.y + item.h);
      skeletons.push({
        type: 'rectangle',
        x,
        y,
        width: Math.abs(item.w),
        height: Math.abs(item.h),
        strokeColor: item.color,
        backgroundColor: 'transparent',
        strokeWidth: item.size,
        roughness: 1,
      });
      continue;
    }
    if (item.kind === 'arrow') {
      skeletons.push({
        type: 'arrow',
        x: item.x1,
        y: item.y1,
        points: [[0, 0], [item.x2 - item.x1, item.y2 - item.y1]],
        strokeColor: item.color,
        backgroundColor: 'transparent',
        strokeWidth: item.size,
        endArrowhead: 'arrow',
        roughness: 1,
      });
      continue;
    }
    if (item.kind === 'text') {
      skeletons.push({
        type: 'text',
        x: item.x,
        y: item.y - item.size,
        text: item.text,
        fontSize: Math.max(12, item.size),
        strokeColor: item.color,
        backgroundColor: 'transparent',
      });
      continue;
    }
    if (item.points.length === 0) continue;
    const origin = item.points[0]!;
    skeletons.push({
      type: 'line',
      x: origin.x,
      y: origin.y,
      points: item.points.map((point) => [point.x - origin.x, point.y - origin.y]),
      strokeColor: item.color,
      backgroundColor: 'transparent',
      strokeWidth: item.size,
      roughness: 1,
    });
  }

  try {
    return convertToExcalidrawElements(skeletons as never[], { regenerateIds: true }) as unknown[];
  } catch {
    return [];
  }
}

function excalidrawLangCode(locale: Locale): string {
  const map: Record<Locale, string> = {
    'en': 'en',
    'id': 'id-ID',
    'de': 'de-DE',
    'zh-CN': 'zh-CN',
    'zh-TW': 'zh-TW',
    'pt-BR': 'pt-BR',
    'es-ES': 'es-ES',
    'ru': 'ru-RU',
    'fa': 'fa-IR',
    'ar': 'ar-SA',
    'ja': 'ja-JP',
    'ko': 'ko-KR',
    'pl': 'pl-PL',
    'hu': 'hu-HU',
    'fr': 'fr-FR',
    'uk': 'uk-UA',
    'tr': 'tr-TR',
    'th': 'en',
    'it': 'it-IT',
  };
  return map[locale] ?? 'en';
}

function readExcalidrawTheme(): 'light' | 'dark' {
  if (typeof document === 'undefined') return 'light';
  return document.documentElement.getAttribute('data-theme') === 'dark' ? 'dark' : 'light';
}

function cloneJson<T>(value: unknown, fallback: T): T {
  try {
    return JSON.parse(JSON.stringify(value)) as T;
  } catch {
    return fallback;
  }
}
