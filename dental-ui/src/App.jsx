import { useState, useRef } from "react";
import "./App.css";

export default function App() {
  const [imageURL, setImageURL] = useState(null);
  const [imageFile, setImageFile] = useState(null);
  const [analyzed, setAnalyzed] = useState(false);

  const fileInputRef = useRef(null);

  const [detections, setDetections] = useState([]);
  const [selected, setSelected] = useState(null);
  const [report, setReport] = useState("");

  // MODAL
  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState("");

  // ADD NEW
  const [adding, setAdding] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newPos, setNewPos] = useState({ x: 0, y: 0 });


  // UPLOAD
  
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageFile(file);
      setImageURL(URL.createObjectURL(file));
      setAnalyzed(false);
      setSelected(null);
      setReport("");
    }
  };

  
  // ANALYZE 
 
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
      console.log("Backend response:", data);

      const formatted = data.detections.map((d, index) => ({
        id: index + 1,
        label: d.class_name,
        x: d.bbox[0],
        y: d.bbox[1],
        confidence: d.confidence,
      }));

      setDetections(formatted);
      setAnalyzed(true);

    } catch (err) {
      console.error("Error:", err);
    }
  };

  // CLICK IMAGE
  const handleImageClick = (e) => {
    if (!analyzed) return;

    const rect = e.currentTarget.getBoundingClientRect();

    setNewPos({
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
    });

    setAdding(true);
    setNewNote("");
  };

  const saveNewDetection = () => {
    if (!newNote) return;

    const newDetection = {
      id: Date.now(),
      label: newNote,
      x: newPos.x,
      y: newPos.y,
    };

    setDetections([...detections, newDetection]);
    setAdding(false);
  };

  // EDIT / DELETE
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

  // REPORT
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
        <div className="image-section" onClick={handleImageClick}>

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

          {/* IMAGE */}
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

              <img src={imageURL} alt="xray" className="xray-image" />

              {/* TEMP DOTS */}
              {analyzed && detections.map((d) => (
                <div
                  key={d.id}
                  className={`dot ${selected?.id === d.id ? "active" : ""}`}
                  style={{ left: d.x, top: d.y }}
                  onClick={(e) => {
                    e.stopPropagation();
                    setSelected(d);
                  }}
                />
              ))}
            </>
          )}
        </div>

        {/* RIGHT PANEL */}
        {analyzed && (
          <div className="panel">
            <h2 className="panel-title">
              Findings <span>({detections.length})</span>
            </h2>

            {detections.map((d, index) => (
              <div
                key={d.id}
                className={`card ${selected?.id === d.id ? "selected" : ""}`}
                onClick={() => setSelected(d)}
              >
                <div className="card-header">
                  <h3>🦷 {d.label}</h3>
                  <span className="badge">{index + 1}</span>
                </div>

                <p className="desc">
                  Confidence: {(d.confidence * 100).toFixed(1)}%
                </p>
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
          <div className="modal" onClick={() => setEditOpen(false)}>
            <div className="modal-content" onClick={(e) => e.stopPropagation()}>
              <h3 className="modal-title">Edit Label</h3>

              <input
                className="modal-input"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
              />

              <div className="modal-actions">
                <button className="save-btn" onClick={saveEdit}>
                  Save
                </button>
                <button className="cancel-btn" onClick={() => setEditOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}