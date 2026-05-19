import { useCallback, useEffect, useState } from 'react';
import { useStore } from '../data/store';
import { parseFiles } from '../data/parsers';
import { buildDemoData } from '../data/demo';

export function Dropzone() {
  const addDatasets = useStore((s) => s.addDatasets);
  const addWarnings = useStore((s) => s.addWarnings);
  const datasets = useStore((s) => s.datasets);
  const [over, setOver] = useState(false);

  const handle = useCallback(
    async (files: FileList | File[]) => {
      const arr = Array.from(files);
      if (!arr.length) return;
      const { datasets: parsed, warnings } = await parseFiles(arr);
      if (parsed.length) addDatasets(parsed);
      if (warnings.length) addWarnings('drop', warnings);
    },
    [addDatasets, addWarnings],
  );

  useEffect(() => {
    const onDragOver = (e: DragEvent) => {
      e.preventDefault();
      setOver(true);
    };
    const onDragLeave = (e: DragEvent) => {
      // Only un-highlight when leaving the window
      if ((e as any).relatedTarget == null) setOver(false);
    };
    const onDrop = async (e: DragEvent) => {
      e.preventDefault();
      setOver(false);
      const items = e.dataTransfer?.items;
      const files: File[] = [];
      if (items) {
        for (const it of items) {
          if (it.kind === 'file') {
            const entry = (it as any).webkitGetAsEntry?.();
            if (entry && entry.isDirectory) {
              files.push(...(await walkDir(entry)));
            } else {
              const f = it.getAsFile();
              if (f) files.push(f);
            }
          }
        }
      } else if (e.dataTransfer?.files) {
        files.push(...Array.from(e.dataTransfer.files));
      }
      await handle(files);
    };
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);
    return () => {
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [handle]);

  const empty = datasets.length === 0;
  return (
    <>
      <div className={`drop-overlay ${over ? 'over' : ''}`}>Drop files anywhere</div>
      {empty && (
        <div className="empty-state">
          <h1>NCAS-AMMS Visualiser</h1>
          <p>
            Drop AMMSS data files anywhere on this page, or click <strong>+ Add data</strong> in the sidebar. Supported:
            UAV (<code>.h5</code> / <code>UAV_data*.csv</code>), Windsond (<code>.sounding.csv</code>,{' '}
            <code>.raw_flight_history.csv</code>, <code>.raw.csv</code>, <code>.sharppy.txt</code>, <code>.kml</code>), sky-camera met (
            <code>*WxSensor.csv</code>), Kestrels (<code>WEATHER - *.csv</code>), walk workbooks (
            <code>NCAS_AMMSS_Blencathra_*.xlsx</code>), backpack loggers, HOBO references, photos with GPS EXIF.
          </p>
          <button onClick={() => addDatasets(buildDemoData())}>Load synthetic demo data</button>
        </div>
      )}
    </>
  );
}

async function walkDir(entry: any): Promise<File[]> {
  if (entry.isFile) {
    return new Promise<File[]>((resolve) => entry.file((f: File) => resolve([f])));
  }
  if (entry.isDirectory) {
    const reader = entry.createReader();
    const all: File[] = [];
    let chunk: any[] = [];
    do {
      chunk = await new Promise((resolve) => reader.readEntries(resolve));
      for (const sub of chunk) {
        all.push(...(await walkDir(sub)));
      }
    } while (chunk.length);
    return all;
  }
  return [];
}
