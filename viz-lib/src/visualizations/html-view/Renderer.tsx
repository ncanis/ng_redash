import React, { useCallback, useEffect, useRef } from "react";
import sanitize from "@/services/sanitize";
import { RendererPropTypes } from "@/visualizations/prop-types";

import "./renderer.less";

const SANITIZE_OPTIONS = {
  WHOLE_DOCUMENT: true,
  ADD_TAGS: ["style", "link"],
  ADD_ATTR: [
    "style",
    "rel",
    "href",
    "type",
    "media",
    "as",
    "crossorigin",
    "integrity",
    "referrerpolicy",
    "sizes",
  ],
  FORBID_TAGS: ["script"],
};

const NO_SCROLL_STYLE = "<style>html,body{overflow:hidden!important;margin:0!important;}</style>";

function renderMessage(message: string, testId: string) {
  return (
    <div className="html-view-visualization__message" data-test={testId}>
      {message}
    </div>
  );
}

function decodeHtmlEntities(value: string) {
  if (!value || value.indexOf("&") === -1) {
    return value;
  }

  if (typeof window === "undefined") {
    return value;
  }

  const textarea = window.document.createElement("textarea");
  textarea.innerHTML = value;
  return textarea.value;
}

function stripScripts(html: string) {
  return html.replace(/<script[\s\S]*?>[\s\S]*?<\/script>/gi, "");
}

function injectNoScrollStyle(html: string) {
  if (!html) {
    return html;
  }

  if (/<\/head>/i.test(html)) {
    return html.replace(/<\/head>/i, `${NO_SCROLL_STYLE}</head>`);
  }

  if (/<html[\s\S]*?>/i.test(html)) {
    return html.replace(/<html([\s\S]*?)>/i, `<html$1><head>${NO_SCROLL_STYLE}</head>`);
  }

  return `${NO_SCROLL_STYLE}${html}`;
}

function buildSrcDoc(content: string) {
  const decodedContent = decodeHtmlEntities(content || "");
  const hasHtmlRoot = /<html[\s>]/i.test(decodedContent);

  if (hasHtmlRoot) {
    const sanitized = stripScripts(decodedContent);
    return injectNoScrollStyle(sanitized);
  }

  const sanitized = sanitize(decodedContent, SANITIZE_OPTIONS);
  return `<!DOCTYPE html><html><head><meta charset="utf-8">${NO_SCROLL_STYLE}</head><body>${sanitized}</body></html>`;
}

type HtmlFrameProps = {
  srcDoc: string;
  title: string;
};

function HtmlFrame({ srcDoc, title }: HtmlFrameProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);

  const resizeToContent = useCallback(() => {
    const iframe = iframeRef.current;
    if (!iframe) {
      return;
    }

    try {
      const doc = iframe.contentDocument;
      if (!doc) {
        return;
      }

      const body = doc.body;
      const html = doc.documentElement;
      const height = Math.max(
        body?.scrollHeight || 0,
        body?.offsetHeight || 0,
        html?.clientHeight || 0,
        html?.scrollHeight || 0,
        html?.offsetHeight || 0
      );

      if (height > 0) {
        iframe.style.height = `${height}px`;
      }
    } catch (error) {
      // Accessing iframe contents should be safe for srcDoc, but guard just in case.
    }
  }, []);

  useEffect(() => {
    resizeToContent();
  }, [srcDoc, resizeToContent]);

  return (
    <iframe
      ref={iframeRef}
      title={title}
      className="html-view-visualization__iframe"
      sandbox="allow-same-origin"
      srcDoc={srcDoc}
      onLoad={resizeToContent}
      scrolling="no"
    />
  );
}

export default function Renderer({ data, options }: any) {
  const columnName = options.column;

  if (!columnName) {
    return renderMessage("Select a column to render as HTML.", "HtmlViewVisualization.NoColumn");
  }

  const columnExists = data.columns.some((column: any) => column.name === columnName);

  if (!columnExists) {
    return renderMessage(`Column "${columnName}" not available in result set.`, "HtmlViewVisualization.MissingColumn");
  }

  if (!data.rows || data.rows.length === 0) {
    return renderMessage("No rows returned from query.", "HtmlViewVisualization.EmptyRows");
  }

  return (
    <div className="html-view-visualization" data-test="HtmlViewVisualization">
      {data.rows.map((row: any, index: number) => {
        const value = row[columnName];
        const srcDoc = buildSrcDoc(value != null ? String(value) : "");

        return (
          <HtmlFrame key={index} title={`HtmlView row ${index + 1}`} srcDoc={srcDoc} />
        );
      })}
    </div>
  );
}

Renderer.propTypes = RendererPropTypes;
