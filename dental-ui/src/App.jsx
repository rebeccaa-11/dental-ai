import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import "./App.css";

// Convert screen-space coords (relative to img element) → natural image coords
const toNatural = (sx, sy, img) => {
  const rect = img.getBoundingClientRect();
  return [
    (sx / rect.width)  * img.naturalWidth,
    (sy / rect.height) * img.naturalHeight,
  ];
};

export default function App() {

  // ================= STATE =================
  const [imageURL,    setImageURL]    = useState(null);
  const [imageFile,   setImageFile]   = useState(null);
  const [analyzed,    setAnalyzed]    = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const fileInputRef = useRef(null);
  const imageRef     = useRef(null);

  const [detections, setDetections] = useState([]);
  const [selected,   setSelected]   = useState(null);

  const [reportData, setReportData] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);

  const [saveStatus, setSaveStatus] = useState(null); // null | 'saving' | 'saved' | 'error'
  const [reportLoading, setReportLoading] = useState(false);

  // ===== POLYGON DRAWING =====
  const [naturalPts, setNaturalPts] = useState([]); // natural-image-space points
  const [drawMode,   setDrawMode]   = useState(false);
  const [polyLabel,  setPolyLabel]  = useState("");
  const [labelOpen,  setLabelOpen]  = useState(false);
  const [imageId,    setImageId]    = useState(null);

  // ================= UPLOAD =================
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setImageFile(file);
    setImageURL(URL.createObjectURL(file));
    setAnalyzed(false);
    setDetections([]);
    setNaturalPts([]);
    setDrawMode(false);
  };

  // ================= ANALYZE =================
  const handleAnalyze = async () => {
    const formData = new FormData();
    formData.append("file", imageFile);
    const res  = await fetch("http://127.0.0.1:8000/overlay-data", { method: "POST", body: formData });
    const data = await res.json();
    setImageId(data.image_id);
    setDetections(
      data.detections.map((d, i) => ({
        id:         i + 1,
        class_id:   d.class_id,
        class_name: d.class_name,
        confidence: d.confidence,
        bbox:       d.bbox,
        mask:       d.mask,
        is_valid:   true,
        isManual:   false,
      }))
    );
    setAnalyzed(true);
  };

  // ================= SAVE =================
  // All detections — both AI and manual — are included.
  // Manual polygons have class_id: 0 and bbox: [0,0,0,0] to satisfy FastAPI validation.
  const saveAllAnnotations = async () => {
    setSaveStatus("saving");
    const payload = {
      image_id: imageId,
      annotations: detections.map((d) => ({
        class_id:   d.class_id   ?? 0,
        class_name: d.class_name,
        confidence: d.confidence ?? null,
        bbox:       (d.bbox && d.bbox.length === 4) ? d.bbox : [0, 0, 0, 0],
        mask:       d.mask       ?? [],
        is_valid:   d.is_valid   !== false,
      })),
    };
    console.log("Saving payload:", JSON.stringify(payload, null, 2));
    try {
      const res = await fetch("http://127.0.0.1:8000/save-annotations", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      await res.json();
      setSaveStatus("saved");
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 2500);
    }
  };

  // ================= REPORT =================
const generateReport = async () => {
  setReportLoading(true);
  try {
    const res = await fetch("http://127.0.0.1:8000/generate-report", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ image_id: imageId }),
    });
    const data = await res.json();
    setReportData(data);
    setReportOpen(true);
  } catch (err) {
    console.error(err);
  } finally {
    setReportLoading(false);
  }
};

const downloadPDF = async () => {
    const pdf    = new jsPDF({ unit: "mm", format: "a4" });
    const W      = 210;
    const margin = 20;
    const usable = W - margin * 2;
    let   y      = margin;

    // ── WHITE BACKGROUND ─────────────────────────────────
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, 210, 297, "F");

    // ── HEADER BAR ───────────────────────────────────────
    pdf.setFillColor(15, 40, 25);
    pdf.rect(0, 0, 210, 28, "F");

    pdf.setFontSize(16);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(52, 211, 153);
    pdf.text("Dental X-ray Analysis Report", margin, 12);

    pdf.setFontSize(9);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(180, 220, 200);
    pdf.text("Generated: " + new Date().toLocaleDateString("en-GB", { year:"numeric", month:"long", day:"numeric" }), margin, 20);
    pdf.text("AI-Assisted Dental Diagnostic System", W - margin, 20, { align: "right" });

    y = 36;

    // ── X-RAY IMAGE ──────────────────────────────────────
    try {
      const imgEl  = document.querySelector(".report-image");
      const imgSrc = imgEl.src;
      // Fetch as blob to bypass cross-origin canvas taint restriction
      const blob    = await fetch(imgSrc).then(r => r.blob());
      const imgData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      const imgH = Math.round((imgEl.naturalHeight / imgEl.naturalWidth) * usable);
      pdf.addImage(imgData, "JPEG", margin, y, usable, imgH);
      y += imgH + 6;

      pdf.setFontSize(8);
      pdf.setFont("helvetica", "italic");
      pdf.setTextColor(120, 120, 120);
      pdf.text("Figure 1 — Annotated panoramic dental radiograph", margin, y);
      y += 8;
    } catch (e) {
      console.warn("Could not embed image:", e);
      y += 4;
    }

    // ── DIVIDER ──────────────────────────────────────────
    pdf.setDrawColor("#dddddd");
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, W - margin, y);
    y += 5;

    // ── FINDINGS TABLE ───────────────────────────────────
    pdf.setFontSize(11);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(15, 40, 25);
    pdf.text("DETECTED FINDINGS", margin, y);
    y += 6;

    pdf.setFillColor(240, 248, 244);
    pdf.rect(margin, y - 4, usable, 8, "F");
    pdf.setFontSize(9);
    pdf.setFont("helvetica", "bold");
    pdf.setTextColor(52, 130, 90);
    pdf.text("#",          margin + 2,   y);
    pdf.text("Finding",    margin + 12,  y);
    pdf.text("Confidence", margin + 90,  y);
    pdf.text("Type",       margin + 130, y);
    y += 5;

    pdf.setDrawColor("#cccccc");
    pdf.line(margin, y, W - margin, y);
    y += 4;

    detections.forEach((d, i) => {
      if (y > 265) { pdf.addPage(); y = margin; }
      if (i % 2 === 0) {
        pdf.setFillColor(250, 252, 251);
        pdf.rect(margin, y - 3.5, usable, 7, "F");
      }
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(30, 30, 30);
      pdf.text(String(i + 1),             margin + 2,   y);
      pdf.text(d.class_name,              margin + 12,  y);
      pdf.text(d.confidence != null ? (d.confidence * 100).toFixed(1) + "%" : "—", margin + 90, y);
      pdf.text(d.isManual ? "Manual" : "AI", margin + 130, y);
      y += 7;
    });

    y += 4;
    pdf.setDrawColor("#dddddd");
    pdf.line(margin, y, W - margin, y);
    y += 5;

    // ── DIAGNOSIS ────────────────────────────────────────
    if (reportData?.diagnosis) {
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(15, 40, 25);
      pdf.text("DIAGNOSIS", margin, y);
      y += 6;
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(40, 40, 40);
      const diagLines = pdf.splitTextToSize(reportData.diagnosis, usable);
      pdf.text(diagLines, margin, y);
      y += diagLines.length * 5 + 6;
    }

    pdf.setDrawColor("#dddddd");
    pdf.line(margin, y, W - margin, y);
    y += 5;

    // ── TREATMENT PLAN ───────────────────────────────────
    if (reportData?.treatment_plan) {
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(15, 40, 25);
      pdf.text("TREATMENT PLAN", margin, y);
      y += 6;
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(40, 40, 40);
      const planLines = pdf.splitTextToSize(reportData.treatment_plan, usable);
      pdf.text(planLines, margin, y);
    }

    // ── FOOTER ───────────────────────────────────────────
    pdf.setFillColor(15, 40, 25);
    pdf.rect(0, 282, 210, 15, "F");
    pdf.setFontSize(8);
    pdf.setFont("helvetica", "normal");
    pdf.setTextColor(120, 180, 150);
    pdf.text("This report is AI-assisted and should be reviewed by a licensed dental professional.", margin, 291);
    pdf.text("Page 1", W - margin, 291, { align: "right" });

    pdf.save("Dental_Report.pdf");
  };

  // ================= POLYGON DRAW =================
  const handleSvgClick = useCallback((e) => {
    if (!drawMode || !imageRef.current) return;
    e.stopPropagation();
    const img  = imageRef.current;
    const rect = img.getBoundingClientRect();
    const sx   = e.clientX - rect.left;
    const sy   = e.clientY - rect.top;
    setNaturalPts((prev) => [...prev, toNatural(sx, sy, img)]);
  }, [drawMode]);

  const finishPolygon = useCallback(() => {
    if (naturalPts.length < 3) return;
    setLabelOpen(true);
  }, [naturalPts]);

  // When the dentist confirms the label:
  // 1. Add to detections (shows in right panel immediately)
  // 2. mask = naturalPts (natural image coords, matches what backend expects)
  // 3. class_id = 0, bbox = [0,0,0,0] so FastAPI validation passes
  const savePolygon = () => {
    if (!polyLabel.trim() || naturalPts.length < 3) return;
    setDetections((prev) => [
      ...prev,
      {
        id:         Date.now(),
        class_id:   0,
        class_name: polyLabel.trim(),
        confidence: null,
        bbox:       [0, 0, 0, 0],
        mask:       naturalPts,   // <-- real drawn coords, sent in JSON on Save
        is_valid:   true,
        isManual:   true,
      },
    ]);
    setNaturalPts([]);
    setPolyLabel("");
    setLabelOpen(false);
    setDrawMode(false);
  };

  const cancelDraw = useCallback(() => {
    setNaturalPts([]);
    setPolyLabel("");
    setLabelOpen(false);
    setDrawMode(false);
  }, []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Enter" && drawMode && !labelOpen) finishPolygon();
      if (e.key === "Escape") cancelDraw();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [drawMode, labelOpen, finishPolygon, cancelDraw]);

  // ================= UI =================
  return (
    <div className="bg-wrapper">
      <div className={`container ${analyzed ? "split" : "full"}`}>

        {/* LEFT SIDE */}
        <div className="image-section">

          {/* START SCREEN */}
          {!imageURL && (
            <div className="start-screen">
              <div className="start-content">
                <div className="start-text">
                  <h1 className="hero-title">Upload a Dental X-ray</h1>
                  <p className="hero-sub">Start AI-powered anomaly detection</p>
                </div>
                <button className="upload-btn" onClick={() => fileInputRef.current.click()}>
                  <svg className="upload-icon" viewBox="0 0 24 24" fill="none">
                    <path d="M12 16V4M12 4L7 9M12 4L17 9" stroke="white" strokeWidth="2"/>
                    <path d="M4 20H20" stroke="white" strokeWidth="2"/>
                  </svg>
                  <span className="upload-text">Upload X-ray</span>
                </button>
              </div>
              <input type="file" ref={fileInputRef} onChange={handleUpload} hidden />
            </div>
          )}

          {/* IMAGE + CONTROLS */}
          {imageURL && (
            <>
              <div className="top-bar">
                <button className="Btn" onClick={handleAnalyze} disabled={analyzed}>
                  <div className="sign">
                    <svg viewBox="0 0 512 512">
                      <path d="M256 32L96 192h96v128h128V192h96L256 32z"/>
                    </svg>
                  </div>
                  <div className="text">{analyzed ? "Analyzed ✓" : "Analyze"}</div>
                </button>

                {analyzed && (
                  <button
                    className={`Btn ${drawMode ? "Btn--drawing" : ""}`}
                    onClick={() => drawMode ? cancelDraw() : setDrawMode(true)}
                  >
                    <div className="sign">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                        <path d="M12 20h9"/>
                        <path d="M16.5 3.5a2.121 2.121 0 013 3L7 19l-4 1 1-4L16.5 3.5z"/>
                      </svg>
                    </div>
                    <div className="text">{drawMode ? "Cancel" : "Draw"}</div>
                  </button>
                )}
              </div>

              {/* Drawing instructions */}
              {drawMode && (
                <div className="draw-hint-bar">
                  <span>✏️ Click to place points</span>
                  <span className="hint-sep">·</span>
                  <span><kbd>Enter</kbd> or double-click to finish</span>
                  <span className="hint-sep">·</span>
                  <span><kbd>Esc</kbd> to cancel</span>
                  {naturalPts.length > 0 && (
                    <span className="draw-count">{naturalPts.length} pt{naturalPts.length !== 1 ? "s" : ""}</span>
                  )}
                </div>
              )}

              {/* Image + overlay */}
              <div className="xray-wrap">
                <img
                  ref={imageRef}
                  src={imageURL}
                  alt="xray"
                  className="xray-image"
                  onLoad={() => setImageLoaded(true)}
                  draggable={false}
                />

                {analyzed && imageLoaded && imageRef.current && (
                  <svg
                    className="overlay"
                    viewBox={`0 0 ${imageRef.current.naturalWidth} ${imageRef.current.naturalHeight}`}
                    preserveAspectRatio="xMidYMid meet"
                    style={{ cursor: drawMode ? "crosshair" : "default" }}
                    onClick={handleSvgClick}
                    onDoubleClick={(e) => { e.stopPropagation(); finishPolygon(); }}
                  >
                    {/* All detections (AI + manual) */}
                    {detections.map((d) => (
                      <g
                        key={d.id}
                        onClick={(e) => { if (!drawMode) { e.stopPropagation(); setSelected(d); } }}
                        style={{ cursor: drawMode ? "crosshair" : "pointer" }}
                      >
                        <polygon
                          points={d.mask?.map(([x, y]) => `${x},${y}`).join(" ")}
                          className={`mask ${selected?.id === d.id ? "active" : ""} ${d.isManual ? "mask--manual" : ""}`}
                        />
                      </g>
                    ))}

                    {/* Live drawing preview */}
                    {drawMode && naturalPts.length > 0 && (
                      <>
                        <polyline
                          points={naturalPts.map(([x, y]) => `${x},${y}`).join(" ")}
                          fill="none"
                          stroke="yellow"
                          strokeWidth="3"
                          strokeDasharray="8 4"
                        />
                        {naturalPts.map(([x, y], i) => (
                          <circle key={i} cx={x} cy={y} r="6" fill="yellow" stroke="white" strokeWidth="2"/>
                        ))}
                        {naturalPts.length >= 3 && (
                          <line
                            x1={naturalPts[naturalPts.length - 1][0]}
                            y1={naturalPts[naturalPts.length - 1][1]}
                            x2={naturalPts[0][0]}
                            y2={naturalPts[0][1]}
                            stroke="yellow"
                            strokeWidth="2"
                            strokeDasharray="4 4"
                            opacity="0.45"
                          />
                        )}
                      </>
                    )}
                  </svg>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL */}
        {analyzed && (
          <div className="panel">
            <h2>Findings ({detections.length})</h2>

            {detections.map((d) => (
              <div
                key={d.id}
                className={`card ${selected?.id === d.id ? "card--selected" : ""}`}
                onClick={() => setSelected(d)}
                style={{ cursor: "pointer" }}
              >
                <h3>
                  🦷 {d.class_name}
                  {d.isManual && <span className="tag-manual">manual</span>}
                </h3>
                {d.confidence != null && (
                  <p>Confidence: {(d.confidence * 100).toFixed(1)}%</p>
                )}
              </div>
            ))}

            <button
              className={`save-status-btn${saveStatus === "saved" ? " saved" : ""}${saveStatus === "error" ? " error" : ""}`}
              onClick={saveAllAnnotations}
              disabled={saveStatus === "saving"}
            >
              {saveStatus === "saving" ? "Saving…"
                : saveStatus === "saved" ? "Saved ✓"
                : saveStatus === "error"  ? "Error — retry"
                : "Save"}
            </button>

            <button className="report-btn" onClick={generateReport} disabled={reportLoading}>
              {reportLoading ? "Generating…" : "Generate Report"}
            </button>
            {reportLoading && (
              <div className="report-loading-bar">
                <div className="report-loading-fill" />
              </div>
            )}
          </div>
        )}

        {/* REPORT MODAL */}
        {reportOpen && reportData && (
          <div className="modal">
            <div className="modal-content report-modal">
              <h2>{reportData.title}</h2>
              <img src={`http://127.0.0.1:8000/${reportData.image_url.replace(/^\/+/, "")}`} className="report-image" alt="report"/>
              <h4>Diagnosis</h4>
              <p>{reportData.diagnosis}</p>
              <h4>Treatment Plan</h4>
              <p>{reportData.treatment_plan}</p>
              <div className="modal-actions">
                <button onClick={downloadPDF}>Download PDF</button>
                <button onClick={() => setReportOpen(false)}>Close</button>
              </div>
            </div>
          </div>
        )}

      </div>

      {/* LABEL DIALOG — rendered via portal directly on document.body
          so it's never clipped by the container's stacking context       */}
      {labelOpen && createPortal(
        <div className="label-overlay">
          <div className="label-dialog">
            <p className="label-dialog-title">Name this anomaly</p>
            <p className="label-dialog-sub">{naturalPts.length} points drawn</p>
            <input
              className="label-dialog-input"
              value={polyLabel}
              onChange={(e) => setPolyLabel(e.target.value)}
              placeholder="e.g. Deep caries, Periapical lesion…"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter")  savePolygon();
                if (e.key === "Escape") cancelDraw();
              }}
            />
            <div className="label-dialog-actions">
              <button className="label-btn-save" onClick={savePolygon} disabled={!polyLabel.trim()}>
                Confirm
              </button>
              <button className="label-btn-cancel" onClick={cancelDraw}>
                Cancel
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}
    </div>
  );
}
