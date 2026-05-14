import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import jsPDF from "jspdf";
import "./App.css";

export default function App() {

  // ================= STATE =================
  const [imageURL,    setImageURL]    = useState(null);
  const [imageFile,   setImageFile]   = useState(null);
  const [analyzed,    setAnalyzed]    = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);
  const [analyzing,   setAnalyzing]   = useState(false);

  const fileInputRef = useRef(null);
  const imageRef     = useRef(null);
  const wrapRef      = useRef(null);

  const [detections, setDetections] = useState([]);
  const [selected,   setSelected]   = useState(null);

  const [reportData,    setReportData]    = useState(null);
  const [reportLoading, setReportLoading] = useState(false);
  const [pdfUrl,        setPdfUrl]        = useState(null);

  const [saveStatus, setSaveStatus] = useState(null);
  const [hasSaved,   setHasSaved]   = useState(false);

  // ===== ZOOM / PAN =====
  const [zoom,      setZoom]      = useState(1);
  const [pan,       setPan]       = useState({ x: 0, y: 0 });
  const [showMasks, setShowMasks] = useState(true);
  const [panning,   setPanning]   = useState(false);
  const panStart = useRef(null);

  // ===== POLYGON DRAWING =====
  const [naturalPts, setNaturalPts] = useState([]);
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
    setHasSaved(false);
    setZoom(1);
    setPan({ x: 0, y: 0 });
  };

  // ================= ANALYZE =================
  const handleAnalyze = async () => {
    setAnalyzing(true);
    const formData = new FormData();
    formData.append("file", imageFile);
    try {
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
    } catch (err) {
      console.error(err);
    } finally {
      setAnalyzing(false);
    }
  };

  // ================= SAVE =================
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
    try {
      const res = await fetch("http://127.0.0.1:8000/save-annotations", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify(payload),
      });
      await res.json();
      setSaveStatus("saved");
      setHasSaved(true);
      setTimeout(() => setSaveStatus(null), 2500);
    } catch (err) {
      console.error(err);
      setSaveStatus("error");
      setTimeout(() => setSaveStatus(null), 2500);
    }
  };

  // ================= BUILD PDF (shared) =================
  const buildPDF = async (data) => {
    const pdf    = new jsPDF({ unit: "mm", format: "a4" });
    const W      = 210;
    const margin = 20;
    const usable = W - margin * 2;
    let   y      = margin;
    let   page   = 1;

    const addFooter = () => {
      pdf.setFillColor(15, 40, 25);
      pdf.rect(0, 282, 210, 15, "F");
      pdf.setFontSize(8);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(120, 180, 150);
      pdf.text("This report is AI-assisted and should be reviewed by a licensed dental professional.", margin, 291);
      pdf.text(`Page ${page}`, W - margin, 291, { align: "right" });
    };

    const checkPageBreak = (neededSpace = 20) => {
      if (y + neededSpace > 275) {
        addFooter();
        pdf.addPage();
        page++;
        pdf.setFillColor(255, 255, 255);
        pdf.rect(0, 0, 210, 297, "F");
        y = margin;
      }
    };

    // WHITE BACKGROUND
    pdf.setFillColor(255, 255, 255);
    pdf.rect(0, 0, 210, 297, "F");

    // HEADER
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

    // X-RAY IMAGE
    try {
      const imgSrc  = `http://127.0.0.1:8000/${data.image_url.replace(/^\/+/, "")}`;
      const blob    = await fetch(imgSrc).then(r => r.blob());
      const imgData = await new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result);
        reader.readAsDataURL(blob);
      });
      const tmpImg = new Image();
      await new Promise((resolve) => { tmpImg.onload = resolve; tmpImg.src = imgData; });
      const imgH = Math.round((tmpImg.naturalHeight / tmpImg.naturalWidth) * usable);
      checkPageBreak(imgH + 14);
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

    // DIVIDER
    checkPageBreak(10);
    pdf.setDrawColor("#dddddd");
    pdf.setLineWidth(0.3);
    pdf.line(margin, y, W - margin, y);
    y += 5;

    // FINDINGS TABLE
    checkPageBreak(20);
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
      checkPageBreak(10);
      if (i % 2 === 0) {
        pdf.setFillColor(250, 252, 251);
        pdf.rect(margin, y - 3.5, usable, 7, "F");
      }
      pdf.setFontSize(9);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(30, 30, 30);
      pdf.text(String(i + 1),  margin + 2,   y);
      pdf.text(d.class_name,   margin + 12,  y);
      pdf.text(d.confidence != null ? (d.confidence * 100).toFixed(1) + "%" : "—", margin + 90, y);
      pdf.text(d.isManual ? "Manual" : "AI", margin + 130, y);
      y += 7;
    });

    y += 4;
    checkPageBreak(10);
    pdf.setDrawColor("#dddddd");
    pdf.line(margin, y, W - margin, y);
    y += 5;

    // DIAGNOSIS
    if (data?.diagnosis) {
      checkPageBreak(20);
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(15, 40, 25);
      pdf.text("DIAGNOSIS", margin, y);
      y += 6;
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(40, 40, 40);
      const diagLines = pdf.splitTextToSize(data.diagnosis, usable);
      diagLines.forEach((line) => {
        checkPageBreak(6);
        pdf.text(line, margin, y);
        y += 5;
      });
      y += 4;
    }

    checkPageBreak(10);
    pdf.setDrawColor("#dddddd");
    pdf.line(margin, y, W - margin, y);
    y += 5;

    // TREATMENT PLAN
    if (data?.treatment_plan) {
      checkPageBreak(20);
      pdf.setFontSize(11);
      pdf.setFont("helvetica", "bold");
      pdf.setTextColor(15, 40, 25);
      pdf.text("TREATMENT PLAN", margin, y);
      y += 6;
      pdf.setFontSize(10);
      pdf.setFont("helvetica", "normal");
      pdf.setTextColor(40, 40, 40);
      const planLines = pdf.splitTextToSize(data.treatment_plan, usable);
      planLines.forEach((line) => {
        checkPageBreak(6);
        pdf.text(line, margin, y);
        y += 5;
      });
    }

    addFooter();
    return pdf;
  };

  // ================= REPORT =================
  const generateReport = async () => {
    setReportLoading(true);
    try {
      const res  = await fetch("http://127.0.0.1:8000/generate-report", {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ image_id: imageId }),
      });
      const data = await res.json();
      setReportData(data);

      // Build PDF and show as preview
      const pdf  = await buildPDF(data);
      const blob = pdf.output("blob");
      const url  = URL.createObjectURL(blob);
      setPdfUrl(url);
    } catch (err) {
      console.error(err);
    } finally {
      setReportLoading(false);
    }
  };

  const downloadPDF = async () => {
    if (!reportData) return;
    const pdf = await buildPDF(reportData);
    pdf.save("Dental_Report.pdf");
  };

  const closePdfPreview = () => {
    if (pdfUrl) URL.revokeObjectURL(pdfUrl);
    setPdfUrl(null);
  };

  // ================= ZOOM / PAN =================
  const handleMouseDown = useCallback((e) => {
    if (drawMode) return;
    setPanning(true);
    panStart.current = { x: e.clientX - pan.x, y: e.clientY - pan.y };
  }, [drawMode, pan]);

  const handleMouseMove = useCallback((e) => {
    if (!panning || drawMode) return;
    const wrap = wrapRef.current;
    if (!wrap) return;
    const wRect   = wrap.getBoundingClientRect();
    const maxPanX = (wRect.width  * (zoom - 1)) / 2;
    const maxPanY = (wRect.height * (zoom - 1)) / 2;
    const newX    = e.clientX - panStart.current.x;
    const newY    = e.clientY - panStart.current.y;
    setPan({
      x: Math.min(Math.max(newX, -maxPanX), maxPanX),
      y: Math.min(Math.max(newY, -maxPanY), maxPanY),
    });
  }, [panning, drawMode, zoom]);

  const handleMouseUp = useCallback(() => setPanning(false), []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const onWheel = (e) => {
      e.preventDefault();
      e.stopPropagation();
      const delta = e.deltaY > 0 ? 0.9 : 1.1;
      setZoom(prev => Math.min(Math.max(prev * delta, 1), 6));
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, [imageLoaded]);

  // ================= POLYGON DRAW =================
  const handleSvgClick = useCallback((e) => {
    if (!drawMode || !imageRef.current) return;
    e.stopPropagation();

    const img     = imageRef.current;
    const svg     = e.currentTarget;
    const svgRect = svg.getBoundingClientRect();
    const natW    = img.naturalWidth;
    const natH    = img.naturalHeight;
    const svgAspect = svgRect.width / svgRect.height;
    const imgAspect = natW / natH;

    let renderW, renderH, offsetX, offsetY;
    if (imgAspect > svgAspect) {
      renderW = svgRect.width;
      renderH = svgRect.width / imgAspect;
      offsetX = 0;
      offsetY = (svgRect.height - renderH) / 2;
    } else {
      renderH = svgRect.height;
      renderW = svgRect.height * imgAspect;
      offsetX = (svgRect.width - renderW) / 2;
      offsetY = 0;
    }

    const sx = e.clientX - svgRect.left - offsetX;
    const sy = e.clientY - svgRect.top  - offsetY;
    if (sx < 0 || sy < 0 || sx > renderW || sy > renderH) return;

    setNaturalPts((prev) => [...prev, [(sx / renderW) * natW, (sy / renderH) * natH]]);
  }, [drawMode]);

  const finishPolygon = useCallback(() => {
    if (naturalPts.length < 3) return;
    setLabelOpen(true);
  }, [naturalPts]);

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
        mask:       naturalPts,
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
                {!analyzed && (
                  <button className="Btn" onClick={handleAnalyze} disabled={analyzing}>
                    <div className="sign">
                      <svg viewBox="0 0 512 512">
                        <path d="M256 32L96 192h96v128h128V192h96L256 32z"/>
                      </svg>
                    </div>
                    <div className="text">{analyzing ? "Analyzing…" : "Analyze"}</div>
                  </button>
                )}

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
                    <div className="text">{drawMode ? "Cancel" : "Annotate"}</div>
                  </button>
                )}

                {analyzed && (
                  <button
                    className={`Btn ${!showMasks ? "Btn--drawing" : ""}`}
                    onClick={() => setShowMasks(prev => !prev)}
                  >
                    <div className="sign">
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        {showMasks ? (
                          <>
                            <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/>
                            <circle cx="12" cy="12" r="3"/>
                          </>
                        ) : (
                          <>
                            <path d="M17.94 17.94A10.07 10.07 0 0112 20c-7 0-11-8-11-8a18.45 18.45 0 015.06-5.94"/>
                            <path d="M9.9 4.24A9.12 9.12 0 0112 4c7 0 11 8 11 8a18.5 18.5 0 01-2.16 3.19"/>
                            <line x1="1" y1="1" x2="23" y2="23"/>
                          </>
                        )}
                      </svg>
                    </div>
                    <div className="text">{showMasks ? "Hide" : "Show"}</div>
                  </button>
                )}

                {zoom > 1 && (
                  <button className="Btn" onClick={() => { setZoom(1); setPan({ x: 0, y: 0 }); }}>
                    <div className="sign">
                      <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M15 3h6v6M9 21H3v-6M21 3l-7 7M3 21l7-7"/>
                      </svg>
                    </div>
                    <div className="text">Reset</div>
                  </button>
                )}

                <button
                  className="Btn"
                  onClick={() => {
                    setImageURL(null);
                    setImageFile(null);
                    setAnalyzed(false);
                    setImageLoaded(false);
                    setDetections([]);
                    setSelected(null);
                    setNaturalPts([]);
                    setDrawMode(false);
                    setHasSaved(false);
                    setSaveStatus(null);
                    setReportData(null);
                    setImageId(null);
                    setZoom(1);
                    setPan({ x: 0, y: 0 });
                    fileInputRef.current.click();
                  }}
                >
                  <div className="sign">
                    <svg viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round">
                      <line x1="12" y1="5" x2="12" y2="19"/>
                      <line x1="5" y1="12" x2="19" y2="12"/>
                    </svg>
                  </div>
                  <div className="text">New X-ray</div>
                </button>
              </div>

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

              {!drawMode && zoom === 1 && analyzed && (
                <div className="draw-hint-bar" style={{ justifyContent: "center" }}>
                  <span>🔍 Scroll to zoom · Drag to pan</span>
                </div>
              )}

              <div
                className="xray-wrap"
                ref={wrapRef}
                onMouseDown={handleMouseDown}
                onMouseMove={handleMouseMove}
                onMouseUp={handleMouseUp}
                onMouseLeave={handleMouseUp}
                style={{
                  overflow: "hidden",
                  cursor: drawMode ? "crosshair" : panning ? "grabbing" : zoom > 1 ? "grab" : "default",
                }}
              >
                <div style={{
                  transform: `translate(${pan.x}px, ${pan.y}px) scale(${zoom})`,
                  transformOrigin: "center center",
                  width: "100%",
                  height: "100%",
                  willChange: "transform",
                }}>
                  <img
                    ref={imageRef}
                    src={imageURL}
                    alt="xray"
                    className="xray-image"
                    onLoad={() => setImageLoaded(true)}
                    draggable={false}
                  />

                  {analyzing && (
                    <div className="scan-overlay">
                      <div className="scan-line" />
                      <div className="scan-text">Analyzing X-ray…</div>
                    </div>
                  )}

                  {analyzed && imageLoaded && imageRef.current && (
                    <svg
                      className="overlay"
                      viewBox={`0 0 ${imageRef.current.naturalWidth} ${imageRef.current.naturalHeight}`}
                      preserveAspectRatio="xMidYMid meet"
                      style={{ cursor: drawMode ? "crosshair" : "default" }}
                      onClick={handleSvgClick}
                      onDoubleClick={(e) => { e.stopPropagation(); finishPolygon(); }}
                    >
                      {showMasks && detections.map((d) => (
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

                {zoom > 1 && (
                  <div className="zoom-badge">{Math.round(zoom * 100)}%</div>
                )}
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL */}
        {analyzed && (
          <div className="panel">
            <h2>Findings ({detections.length})</h2>

            <div className="finding-list">
              {detections.map((d) => (
                <div
                  key={d.id}
                  className={`card ${selected?.id === d.id ? "card--selected" : ""}`}
                  onClick={() => setSelected(d)}
                  style={{ cursor: "pointer" }}
                >
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <h3>🦷 {d.class_name}</h3>
                      {d.confidence != null && (
                        <p>Confidence: {(d.confidence * 100).toFixed(1)}%</p>
                      )}
                      {d.isManual && <p><span className="tag-manual">manual</span></p>}
                    </div>
                    <button
                      className="card-delete-btn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setDetections(prev => prev.filter(x => x.id !== d.id));
                        if (selected?.id === d.id) setSelected(null);
                      }}
                      title="Delete"
                    >✕</button>
                  </div>
                </div>
              ))}
            </div>

            <div className="panel-footer">
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

              {hasSaved && (
                <>
                  <button className="report-btn" onClick={generateReport} disabled={reportLoading}>
                    {reportLoading ? "Generating…" : "Generate Report"}
                  </button>
                  {reportLoading && (
                    <div className="report-loading-bar">
                      <div className="report-loading-fill" />
                    </div>
                  )}
                </>
              )}
            </div>
          </div>
        )}
      </div>

      {/* PDF PREVIEW MODAL */}
      {pdfUrl && (
        <div className="modal">
          <div className="pdf-preview-box">
            <iframe
              src={pdfUrl}
              title="Report Preview"
              className="pdf-iframe"
            />
            <div className="pdf-preview-actions">
              <button className="modal-actions-btn-primary" onClick={downloadPDF}>
                Download PDF
              </button>
              <button className="modal-actions-btn-secondary" onClick={closePdfPreview}>
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* LABEL DIALOG */}
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