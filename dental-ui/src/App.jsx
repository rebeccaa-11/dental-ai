import { useState, useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";
import "./App.css";

export default function App() {

  // ================= STATE =================
  const [imageURL, setImageURL] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [analyzed, setAnalyzed] = useState(false);
  const [imageLoaded, setImageLoaded] = useState(false);

  const fileInputRef = useRef(null);
  const imageRef = useRef(null);

  const [detections, setDetections] = useState([]);
  const [selected, setSelected] = useState(null);

  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState("");

  const [reportData, setReportData] = useState(null);
  const [reportOpen, setReportOpen] = useState(false);

  // ===== POLYGON DRAWING =====
  const [points, setPoints] = useState([]);
  const [addingPoly, setAddingPoly] = useState(false);
  const [polyLabel, setPolyLabel] = useState("");

  // ================= UPLOAD =================
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    setImageFile(file);
    setImageURL(URL.createObjectURL(file));
    setAnalyzed(false);
    setDetections([]);
    setPoints([]);
  };

  // ================= ANALYZE =================
  const handleAnalyze = async () => {
    const formData = new FormData();
    formData.append("file", imageFile);

    const res = await fetch("http://127.0.0.1:8000/overlay-data", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();

    const formatted = data.detections.map((d, i) => ({
      id: i + 1,
      label: d.class_name,
      confidence: d.confidence,
      mask: d.mask,
    }));

    setDetections(formatted);
    setAnalyzed(true);
  };

  // ================= REPORT =================
  const generateReport = async () => {
    const formData = new FormData();
    formData.append("file", imageFile);

    const res = await fetch("http://127.0.0.1:8000/generate-report", {
      method: "POST",
      body: formData,
    });

    const data = await res.json();
    setReportData(data);
    setReportOpen(true);
  };

  const downloadPDF = async () => {
    const element = document.querySelector(".report-modal");
    const canvas = await html2canvas(element);
    const imgData = canvas.toDataURL("image/png");

    const pdf = new jsPDF();
    pdf.addImage(imgData, "PNG", 10, 10, 180, 0);
    pdf.save("Dental_Report.pdf");
  };

  // ================= POLYGON DRAW =================
  const handleImageClick = (e) => {
    if (!imageRef.current || !analyzed) return;

    const rect = imageRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    setPoints((prev) => [...prev, { x, y }]);
  };

  const finishPolygon = () => {
    if (points.length < 3) return;
    setAddingPoly(true);
  };

  const savePolygon = () => {
    if (!polyLabel || points.length < 3) return;

    const img = imageRef.current;
    const rect = img.getBoundingClientRect();

    const scaleX = img.naturalWidth / rect.width;
    const scaleY = img.naturalHeight / rect.height;

    const realMask = points.map((p) => [
      p.x * scaleX,
      p.y * scaleY,
    ]);

    const newDetection = {
      id: Date.now(),
      label: polyLabel,
      mask: realMask,
      confidence: 1,
      manual: true,
    };

    setDetections([...detections, newDetection]);

    // reset
    setPoints([]);
    setPolyLabel("");
    setAddingPoly(false);
  };

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

                <button
                  className="upload-btn"
                  onClick={() => fileInputRef.current.click()}
                >
                  <svg className="upload-icon" viewBox="0 0 24 24" fill="none">
                    <path d="M12 16V4M12 4L7 9M12 4L17 9" stroke="white" strokeWidth="2"/>
                    <path d="M4 20H20" stroke="white" strokeWidth="2"/>
                  </svg>
                  <span className="upload-text">Upload X-ray</span>
                </button>
              </div>

              <input
                type="file"
                ref={fileInputRef}
                onChange={handleUpload}
                hidden
              />
            </div>
          )}

          {/* IMAGE + ANALYZE */}
          {imageURL && (
            <>
              {!analyzed && (
                <div className="top-bar">
                  <button className="Btn" onClick={handleAnalyze}>
                  <div className="sign">
                    <svg viewBox="0 0 512 512">
                      <path d="M256 32L96 192h96v128h128V192h96L256 32z"/>
                    </svg>
                  </div>
                  <div className="text">Analyze</div>
                </button>
                </div>
              )}

              <div
                className="image-wrapper"
                onClick={handleImageClick}
                onDoubleClick={finishPolygon}
              >
                <img
                  ref={imageRef}
                  src={imageURL}
                  alt="xray"
                  className="xray-image"
                  onLoad={() => setImageLoaded(true)}
                />

                {/* OVERLAY */}
                <svg className="overlay">

                  {/* EXISTING DETECTIONS */}
                  {detections.map((d) => (
                    <polygon
                      key={d.id}
                      points={d.mask?.map(([x, y]) => `${x},${y}`).join(" ")}
                      className="mask"
                    />
                  ))}

                  {/* DRAWING PREVIEW */}
                  {points.length > 0 && (
                    <polyline
                      points={points.map(p => `${p.x},${p.y}`).join(" ")}
                      fill="none"
                      stroke="yellow"
                      strokeWidth="2"
                    />
                  )}

                </svg>
              </div>
            </>
          )}
        </div>

        {/* RIGHT PANEL */}
        {analyzed && (
          <div className="panel">
            <h2>Findings ({detections.length})</h2>

            {detections.map((d) => (
              <div key={d.id} className="card">
                <h3>🦷 {d.label}</h3>
                <p>Confidence: {(d.confidence * 100).toFixed(1)}%</p>
              </div>
            ))}

            <button className="report-btn" onClick={generateReport}>
              Generate Report
            </button>
          </div>
        )}

        {/* REPORT MODAL */}
        {reportOpen && reportData && (
          <div className="modal">
            <div className="modal-content report-modal">

              <h2>{reportData.title}</h2>

              <img
                src={`http://127.0.0.1:8000/${reportData.image_url}`}
                className="report-image"
              />

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

        {/* POLYGON LABEL INPUT */}
        {addingPoly && (
          <div className="add-box">
            <input
              className="add-input"
              value={polyLabel}
              onChange={(e) => setPolyLabel(e.target.value)}
              placeholder="e.g. Deep caries"
            />

            <div className="add-actions">
              <button className="save-btn" onClick={savePolygon}>Save</button>
              <button className="cancel-btn" onClick={() => setAddingPoly(false)}>Cancel</button>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}