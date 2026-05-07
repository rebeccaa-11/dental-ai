import { useState, useRef } from "react";
import "./App.css";

export default function App() {
  const [imageURL, setImageURL] = useState(null);
  const [analyzed, setAnalyzed] = useState(false);
  const fileInputRef = useRef(null);

  const [detections, setDetections] = useState([
    { id: 1, label: "Dental Work", x: 150, y: 220 },
    { id: 2, label: "Caries", x: 420, y: 260 },
    { id: 3, label: "Bone Loss", x: 700, y: 320 },
  ]);

  const [selected, setSelected] = useState(null);
  const [report, setReport] = useState("");

  const [editOpen, setEditOpen] = useState(false);
  const [editValue, setEditValue] = useState("");

  const [adding, setAdding] = useState(false);
  const [newNote, setNewNote] = useState("");
  const [newPos, setNewPos] = useState({ x: 0, y: 0 });

  // Upload
  const handleUpload = (e) => {
    const file = e.target.files[0];
    if (file) {
      setImageURL(URL.createObjectURL(file));
      setAnalyzed(false);
      setSelected(null);
      setReport("");
    }
  };

  // Click image, add anomaly
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

  // Save new anomaly
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

  // Edit
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

  // Delete
  const deleteDetection = (id) => {
    setDetections(detections.filter((d) => d.id !== id));
    setSelected(null);
  };

  // Report
  const generateReport = () => {
    let text = "AI Diagnostic Report\n\n";
    detections.forEach((d) => {
      text += `• ${d.label}\n`;
    });
    setReport(text);
  };

  return (
    <div className="bg-wrapper">
      <div className={`container ${analyzed ? "split" : "full"}`}>

        {/* LEFT SIDE */}
        <div className="image-section" onClick={handleImageClick}>

          {/* UPLOAD */}
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
              <button className="Btn" onClick={() => setAnalyzed(true)}>
  <div className="sign">
    <svg viewBox="0 0 24 24">
      <path fill="white" d="M8 5v14l11-7z" />
    </svg>
  </div>

  <div className="text">Analyze</div>
</button>

              <img src={imageURL} alt="xray" className="xray-image" />

              {/* DOTS */}
              {analyzed &&
                detections.map((d) => (
                  <div
                    key={d.id}
                    className={`dot ${selected?.id === d.id ? "active" : ""}`}
                    style={{ left: d.x, top: d.y }}
                    onClick={(e) => {
                      e.stopPropagation();
                      setSelected(d);
                    }}
                    title={d.label}
                  />
                ))}

              {/* ADD BOX */}
{adding && (
  <div
    className="add-box"
    style={{ left: newPos.x, top: newPos.y }}
    onClick={(e) => e.stopPropagation()}
  >
    <input
      className="add-input"
      value={newNote}
      onChange={(e) => setNewNote(e.target.value)}
      placeholder="e.g. Deep caries"
      autoFocus
      onKeyDown={(e) => {
        if (e.key === "Enter") saveNewDetection();
      }}
    />

    <div className="add-actions">
      <button className="save-btn" onClick={saveNewDetection}>
        Save
      </button>
      <button
        className="cancel-btn"
        onClick={() => setAdding(false)}
      >
        Cancel
      </button>
    </div>
  </div>
)}
            </>
          )}
        </div>

      {/* RIGHT PANEL */}
{analyzed && (
  <div className="panel">

    <h2 className="panel-title">
      Findings 
    </h2>

    {detections.map((d, index) => (
      <div
        key={d.id}
        className={`card ${selected?.id === d.id ? "selected" : ""}`}
        onClick={() => setSelected(d)}
      >
        <div className="card-header">
          <h3>🦷 {d.label}</h3>

          {/* ✅ FIXED NUMBER */}
          <span className="badge">{index + 1}</span>
        </div>

        <p className="desc">Detected anomaly in dental region</p>
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
  <div
    className="modal"
    onClick={() => setEditOpen(false)}  
  >
    <div
      className="modal-content"
      onClick={(e) => e.stopPropagation()} 
    >
      <h3 className="modal-title">Edit Label</h3>

      <input
        className="modal-input"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        autoFocus
        onKeyDown={(e) => e.key === "Enter" && saveEdit()} 
      />

      <div className="modal-actions">
        <button className="save-btn" onClick={saveEdit}>
          Save
        </button>
        <button
          className="cancel-btn"
          onClick={() => setEditOpen(false)}
        >
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