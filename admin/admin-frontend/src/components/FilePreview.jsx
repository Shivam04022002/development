import React, { useEffect, useRef, useState } from "react";

/** Extensions we can render inline as an image. */
const IMAGE_EXTS = ["jpg", "jpeg", "png", "webp"];

/** Lowercase extension of a URL, ignoring query string and hash. */
const extOf = (url) => {
  const clean = String(url || "").split("?")[0].split("#")[0].toLowerCase();
  const match = clean.match(/\.([a-z0-9]+)$/);
  return match ? match[1] : "";
};

const isPDF = (url) => extOf(url) === "pdf";

/**
 * True when the reference should be rendered as an image. Cloudinary delivery
 * URLs can legitimately carry no extension (f_auto), so an extensionless URL is
 * attempted as an image and falls back to the error state if it will not load.
 */
const isImage = (url) => {
  const ext = extOf(url);
  if (!ext) return true;
  return IMAGE_EXTS.includes(ext);
};

/**
 * API base, including the `/api` prefix (e.g. https://host/api).
 * Locally stored files are served by GET /api/files/<relative-path>.
 */
const getApiBaseUrl = () =>
  String(import.meta.env.VITE_API_BASE_URL || "http://localhost:5001/api").replace(/\/+$/, "");

const isCloudinaryUrl = (url) => /res\.cloudinary\.com/i.test(url);

/**
 * For Cloudinary URLs, ensure they serve as inline images by adding f_auto so
 * the format is auto-detected, and replacing non-image extensions.
 */
const fixCloudinaryUrl = (url) => {
  if (!isCloudinaryUrl(url)) return url;

  let fixed = url;

  const nonImageExts = [".ai", ".psd", ".eps", ".svg", ".tiff", ".bmp", ".raw"];
  const urlPath = fixed.split("?")[0].toLowerCase();
  if (nonImageExts.some((ext) => urlPath.endsWith(ext))) {
    fixed = fixed.replace(/\.[a-z]+$/i, ".jpg");
  }

  if (fixed.includes("/upload/") && !fixed.includes("fl_attachment")) {
    fixed = fixed.replace("/upload/", "/upload/f_auto,q_auto/");
  }

  return fixed;
};

/**
 * Turn any stored reference into a full URL.
 * - Absolute URLs (legacy Cloudinary records) → returned as-is.
 * - Relative paths ("applications/FORM-123/photo.jpg", Phase 7 local storage)
 *   → routed through the authenticated file endpoint, /api/files/<path>.
 */
const normalizeFileUrl = (src) => {
  if (!src) return "";

  if (/^https?:\/\//i.test(src)) return fixCloudinaryUrl(src);

  const rel = String(src)
    .trim()
    .replace(/^\/+/, "")
    .replace(/^(api\/)?files\//i, "")
    .replace(/^uploads\//i, "");

  return `${getApiBaseUrl()}/files/${rel}`;
};

/** Files served by /api/files require the admin bearer token. */
const needsAuth = (src) => !!src && !/^https?:\/\//i.test(src);

const authHeaders = () => {
  const token = localStorage.getItem("adminToken");
  return token ? { Authorization: `Bearer ${token}` } : {};
};

/**
 * FilePreview — renders images inline, PDFs as a clickable link, and shows a
 * sized "Preview unavailable" card (with Open File) only for unsupported types
 * or files that genuinely fail to load.
 */
const FilePreview = ({ src, alt, style }) => {
  const [hasError, setHasError] = useState(false);
  const [blobUrl, setBlobUrl] = useState("");
  /** Message shown under the PDF link when a preview cannot be opened. */
  const [pdfError, setPdfError] = useState("");
  /**
   * Object URLs handed to a new tab. They cannot be revoked immediately — the
   * tab needs time to load them — so they are revoked on a timer and any still
   * outstanding are released when this component unmounts.
   */
  const pdfObjectUrls = useRef([]);

  const fileUrl = normalizeFileUrl(src);
  const authed = needsAuth(src);
  const renderable = isImage(fileUrl);

  // Locally stored images cannot be loaded by a bare <img>: the /api/files
  // route is bearer-authenticated and an <img> sends no Authorization header.
  // Fetch them with the token and render from an object URL instead.
  useEffect(() => {
    if (!src || !authed || isPDF(fileUrl) || !renderable) return undefined;

    let cancelled = false;
    let created = "";

    (async () => {
      try {
        const res = await fetch(fileUrl, { headers: authHeaders() });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const blob = await res.blob();
        if (cancelled) return;
        created = URL.createObjectURL(blob);
        setBlobUrl(created);
      } catch {
        if (!cancelled) setHasError(true);
      }
    })();

    return () => {
      cancelled = true;
      if (created) URL.revokeObjectURL(created);
    };
  }, [src, fileUrl, authed, renderable]);

  /** Release any object URL still outstanding when this preview goes away. */
  useEffect(() => {
    const urls = pdfObjectUrls.current;
    return () => {
      urls.forEach((u) => URL.revokeObjectURL(u));
      urls.length = 0;
    };
  }, []);

  if (!src) return null;

  /**
   * Open a PDF using the admin's own session.
   *
   * This previously handed the URL to docs.google.com/gview. That could never
   * work: /api/files is bearer-authenticated, Google fetches from its own
   * servers with none of our credentials, and so received 401 JSON rather than
   * a PDF — which is what "No preview available" was reporting. Making the
   * documents publicly fetchable to satisfy it is not an option; these are
   * Aadhaar and PAN scans.
   *
   * So the fetch happens here instead, with the same token the image path
   * already uses, and the browser renders the result natively from a blob.
   */
  const openPdfAuthenticated = async () => {
    setPdfError("");
    try {
      const response = await fetch(fileUrl, {
        mode: authed ? "same-origin" : "cors",
        headers: authed ? authHeaders() : undefined,
      });

      if (!response.ok) {
        // Deliberately not logging the status body, the URL or the header —
        // the path identifies a customer's document.
        setPdfError(
          response.status === 401 || response.status === 403
            ? "You are not authorised to view this document. Sign in again and retry."
            : response.status === 404
            ? "This document could not be found."
            : "The document could not be opened. Please try again."
        );
        return;
      }

      // A protected route answering with HTML or JSON means something other
      // than the file came back; do not hand that to the PDF viewer.
      const contentType = (response.headers.get("content-type") || "").toLowerCase();
      if (!contentType.includes("application/pdf")) {
        setPdfError("This file is not a PDF, so it was not opened.");
        return;
      }

      const url = URL.createObjectURL(await response.blob());
      pdfObjectUrls.current.push(url);

      const opened = window.open(url, "_blank", "noopener,noreferrer");
      if (!opened) setPdfError("Your browser blocked the preview window. Allow pop-ups and retry.");

      // Long enough for the new tab to load, short enough not to leak.
      setTimeout(() => {
        URL.revokeObjectURL(url);
        pdfObjectUrls.current = pdfObjectUrls.current.filter((u) => u !== url);
      }, 60_000);
    } catch {
      setPdfError("The document could not be opened. Please try again.");
    }
  };

  /** Open the file in a new tab. */
  const handleClick = (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (isPDF(fileUrl)) {
      openPdfAuthenticated();
      return;
    }

    if (blobUrl) {
      window.open(blobUrl, "_blank", "noopener,noreferrer");
      return;
    }

    window.open(fileUrl, "_blank", "noopener,noreferrer");
  };

  /**
   * Open via a fetched blob URL so the browser displays the file inline
   * instead of downloading it, sending the admin token when required.
   */
  const handleOpenAsBlob = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    try {
      const response = await fetch(fileUrl, {
        mode: authed ? "same-origin" : "cors",
        headers: authed ? authHeaders() : undefined,
      });
      if (!response.ok) throw new Error("Fetch failed");

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      window.open(url, "_blank", "noopener,noreferrer");
    } catch {
      window.open(fileUrl, "_blank", "noopener,noreferrer");
    }
  };

  // PDF rendering
  if (isPDF(fileUrl)) {
    return (
      <div
        style={{
          cursor: "pointer",
          color: "#2563eb",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: "6px",
          justifyContent: "center",
          width: style?.width ?? "100%",
          height: style?.height ?? "100%",
          padding: "10px",
        }}
        onClick={handleClick}
        title={`View ${alt} PDF in new tab`}
      >
        <span style={{ display: "flex", alignItems: "center", gap: "8px" }}>
          <span style={{ fontSize: "24px" }}>📄</span>
          <span style={{ fontWeight: "bold", textDecoration: "underline" }}>View PDF</span>
        </span>
        {pdfError ? (
          <span style={{ fontSize: 11.5, color: "#b91c1c", fontWeight: 600, textAlign: "center" }}>
            {pdfError}
          </span>
        ) : null}
      </div>
    );
  }

  // Unsupported type, or an image that genuinely failed to load. Sized to the
  // same box as the image so cards stay aligned.
  if (hasError || !renderable) {
    return (
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 6,
          boxSizing: "border-box",
          width: style?.width ?? "100%",
          height: style?.height ?? "100%",
          minHeight: 60,
          padding: 6,
          border: "1px dashed #e5e7eb",
          borderRadius: style?.borderRadius ?? 4,
          background: "#f9fafb",
          overflow: "hidden",
        }}
      >
        <span style={{ fontSize: 11, color: "#ef4444", fontWeight: 600, lineHeight: 1.2 }}>
          Preview unavailable
        </span>
        <button
          onClick={handleOpenAsBlob}
          style={{
            background: "#2563eb",
            color: "#fff",
            border: "none",
            borderRadius: 6,
            padding: "4px 12px",
            fontSize: 11,
            fontWeight: 700,
            cursor: "pointer",
          }}
        >
          Open File
        </button>
      </div>
    );
  }

  // Locally stored image: wait for the authenticated fetch to produce a blob.
  if (authed && !blobUrl) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxSizing: "border-box",
          width: style?.width ?? "100%",
          height: style?.height ?? "100%",
          minHeight: 60,
          borderRadius: style?.borderRadius ?? 4,
          background: "#f3f4f6",
          fontSize: 11,
          color: "#9ca3af",
        }}
      >
        Loading…
      </div>
    );
  }

  return (
    <img
      src={blobUrl || fileUrl}
      alt={alt}
      title={`Click to view ${alt} in new tab`}
      onClick={handleClick}
      style={{ ...style, cursor: "pointer" }}
      onError={() => setHasError(true)}
    />
  );
};

export default FilePreview;
