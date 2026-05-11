import { useState, useRef } from "react";
import "./App.css";

export default function App() {
  const [imageURL, setImageURL] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [analyzed, setAnalyzed] = useState(false);

  // 🔥 NEW (fix)
  const [imageLoaded, setImageLoaded] = useState(false);

  const fileInputRef = useRef(null);
  const imageRef = useRef(null);

  const [detections, setDetections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [report, setReport] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState("");

  // =========================
  // UPLOAD
  // =========================
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImageURL(URL.createObjectURL(file));
      setAnalyzed(false);
      setSelected(null);
      setReport("");
      setImageLoaded(false); // 🔥 reset
    }
  };

  // =========================
  // ANALYZE
  // =========================
  const handleAnalyze = async () => {
    if (!imageFile) return;

    const formData = new FormData();
    formData.append("file", imageFile);

    try {
      const res = await fetch("http://127.0.0.1:8000/overlay-data", {
        method: "POST",
        body: formData,
      });

      const data = await res.json();
      console.log(data);

      const formatted = data.detections.map((d, index) => {
        const [x1, y1, x2, y2] = d.bbox;

        return {
          id: index + 1,
          label: d.class_name,
          x1,
          y1,
          x2,
          y2,
          mask: d.mask,
          confidence: d.confidence,
        };
      });

      setDetections(formatted);
      setAnalyzed(true);

    } catch (err) {
      console.error(err);
    }
  };

  // =========================
  // EDIT / DELETE
  // =========================
  const editDetection = (id) => {
    const item = detections.find((d) => d.id === id);
    setSelected(item);
    setEditValue(item.label);
    setEditOpen(true);
  };

  const saveEdit = () => {
    setDetections(
      detections.map((d) =>
        d.id === selected.id ? { ...d, label: editValue } : d
      )
    );
    setEditOpen(false);
  };

  const deleteDetection = (id) => {
    setDetections(detections.filter((d) => d.id !== id));
    setSelected(null);
  };

  // =========================
  // REPORT
  // =========================
  const generateReport = () => {
    let text = "AI Diagnostic Report\n\n";
    detections.forEach((d, index) => {
      text += `#${index + 1} - ${d.label} (${(d.confidence * 100).toFixed(1)}%)\n`;
    });
    setReport(text);
  };

  return (
    <div className="bg-wrapper">
      <div className={`container ${analyzed ? "split" : "full"}`}>

        {/* LEFT SIDE */}
        <div className="image-section">

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
                  <svg className="upload-icon" viewBox="0 0 24 24">
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

          {imageURL && (
            <>
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

              <img
                ref={imageRef}
                src={imageURL}
                alt="xray"
                className="xray-image"
                onLoad={() => setImageLoaded(true)} // 🔥 FIX
              />

              {/* OVERLAY */}
              {analyzed && imageLoaded && imageRef.current && (
                <svg className="overlay">

                  {detections.map((d) => {
                    const img = imageRef.current;

                    // 🔥 FIX HERE (VERY IMPORTANT)
                    const rect = img.getBoundingClientRect();

                    const scaleX = rect.width / img.naturalWidth;
                    const scaleY = rect.height / img.naturalHeight;

                    const x = d.x1 * scaleX;
                    const y = d.y1 * scaleY;
                    const width = (d.x2 - d.x1) * scaleX;
                    const height = (d.y2 - d.y1) * scaleY;

                    const points = d.mask
                      ?.map(([px, py]) => `${px * scaleX},${py * scaleY}`)
                      .join(" ");

                    return (
                      <g key={d.id} onClick={() => setSelected(d)}>

                        {points && (
                          <polygon
                            points={points}
                            className={`mask ${selected?.id === d.id ? "active" : ""}`}
                          />
                        )}

                        <rect
                          x={x}
                          y={y}
                          width={width}
                          height={height}
                          className={`bbox ${selected?.id === d.id ? "active" : ""}`}
                        />
                      </g>
                    );
                  })}

                </svg>
              )}
            </>
          )}
        </div>

        {/* RIGHT PANEL */}
        {analyzed && (
          <div className="panel">
            <h2>Findings ({detections.length})</h2>

            {detections.map((d, index) => (
              <div
                key={d.id}
                className={`card ${selected?.id === d.id ? "selected" : ""}`}
                onClick={() => setSelected(d)}
              >
                <h3>🦷 {d.label}</h3>
                <p>Confidence: {(d.confidence * 100).toFixed(1)}%</p>
                <div className="badge">{index + 1}</div>
              </div>
            ))}

            {selected && (
              <div className="actions">
                <button className="edit-btn" onClick={() => editDetection(selected.id)}>
                  Edit
                </button>
                <button className="delete-btn" onClick={() => deleteDetection(selected.id)}>
                  Delete
                </button>
              </div>
            )}

            <button className="report-btn" onClick={generateReport}>
              Generate Report
            </button>

            {report && <pre className="report">{report}</pre>}
          </div>
        )}

        {/* MODAL */}
        {editOpen && (
          <div className="modal">
            <div className="modal-content">
              <h3>Edit Label</h3>

              <input
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />

              <div className="modal-actions">
                <button onClick={saveEdit}>Save</button>
                <button onClick={() => setEditOpen(false)}>Cancel</button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}