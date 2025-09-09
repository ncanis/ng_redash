import React, { useEffect, useMemo, useRef, useState } from "react";
import PropTypes from "prop-types";
import { uniqBy } from "lodash";

import Link from "@/components/Link";
import { Dashboard, urlForDashboard } from "@/services/dashboard";
import { Query } from "@/services/query";

import "./RelatedByTagSidebar.less";

function Section({ title, children }) {
  return (
    <div className="rbts-section">
      <div className="rbts-section-title">{title}</div>
      <div className="rbts-section-content">{children}</div>
    </div>
  );
}

Section.propTypes = {
  title: PropTypes.node.isRequired,
  children: PropTypes.node,
};

Section.defaultProps = { children: null };

export default function RelatedByTagSidebar({
  tags,
  excludeDashboardId,
  excludeQueryId,
  showDashboards,
  showQueries,
  activeDashboardId,
  activeQueryId,
  fetchTagsFromDashboardId,
  fetchTagsFromQueryId,
  className,
}) {
  const [dashboards, setDashboards] = useState([]);
  const [queries, setQueries] = useState([]);
  const [fetchedTags, setFetchedTags] = useState([]);
  const [tagsResolved, setTagsResolved] = useState(Array.isArray(tags) && tags.length > 0);
  const effectiveTags = useMemo(() => (Array.isArray(tags) && tags.length > 0 ? tags : fetchedTags), [tags, fetchedTags]);
  const hasTags = useMemo(() => Array.isArray(effectiveTags) && effectiveTags.length > 0, [effectiveTags]);
  const untaggedMode = useMemo(() => !hasTags, [hasTags]);

  // Refs to manage auto-scrolling to the active item
  const containerRef = useRef(null);
  const activeItemRef = useRef(null);

  // If no tags provided, optionally fetch tags by entity id so sidebar can populate early
  useEffect(() => {
    let cancelled = false;
    if (Array.isArray(tags) && tags.length > 0) {
      setFetchedTags([]);
      setTagsResolved(true);
      return () => {};
    }
    if (fetchTagsFromDashboardId) {
      Dashboard.get({ id: fetchTagsFromDashboardId })
        .then(d => {
          if (!cancelled) setFetchedTags(d.tags || []);
          if (!cancelled) setTagsResolved(true);
        })
        .catch(() => {
          if (!cancelled) {
            setFetchedTags([]);
            setTagsResolved(true);
          }
        });
    } else if (fetchTagsFromQueryId) {
      Query.get({ id: fetchTagsFromQueryId })
        .then(q => {
          if (!cancelled) setFetchedTags(q.tags || []);
          if (!cancelled) setTagsResolved(true);
        })
        .catch(() => {
          if (!cancelled) {
            setFetchedTags([]);
            setTagsResolved(true);
          }
        });
    } else {
      setFetchedTags([]);
      setTagsResolved(true);
    }
    return () => {
      cancelled = true;
    };
  }, [tags, fetchTagsFromDashboardId, fetchTagsFromQueryId]);

  useEffect(() => {
    let isCancelled = false;
    // If tags not yet resolved (we don't know if it's tagged or untagged),
    // avoid showing the unfiltered list; wait until resolved.
    if (!tagsResolved) {
      setDashboards([]);
      setQueries([]);
      return () => {};
    }
    const commonParams = hasTags ? { page: 1, page_size: 250, tags: effectiveTags } : { page: 1, page_size: 250 };



    if (showDashboards) {
      Dashboard.query(commonParams)
        .then(({ results }) => results || [])
        .then(items => (excludeDashboardId ? items.filter(d => String(d.id) !== String(excludeDashboardId)) : items))
        .then(items => (isCancelled ? [] : setDashboards(items)))
        .catch(() => !isCancelled && setDashboards([]));
    } else {
      setDashboards([]);
    }

    if (showQueries) {
      Query.query(commonParams)
        .then(({ results }) => results || [])
        .then(items => (excludeQueryId ? items.filter(q => String(q.id) !== String(excludeQueryId)) : items))
        // .then(items => (hasTags ? items: items.filter(q => q.tags.length===0)))
        .then(items => (isCancelled ? [] : setQueries(items)))
        .catch(() => !isCancelled && setQueries([]));
    } else {
      setQueries([]);
    }

    return () => {
      isCancelled = true;
    };
  }, [tagsResolved, hasTags, effectiveTags, excludeDashboardId, excludeQueryId, showDashboards, showQueries]);

  const dashboardItems = useMemo(() => uniqBy((hasTags ? dashboards : dashboards.filter(d => !(d.tags && d.tags.length))), d => d.id), [dashboards, hasTags]);
  const queryItems = useMemo(() => uniqBy((hasTags ? queries : queries.filter(q => q.tags.length===0 )), q => q.id), [queries, hasTags]);

  const isEmpty = dashboardItems.length === 0 && queryItems.length === 0;

  // Scroll the active item into view when navigation changes active ids or list updates
  useEffect(() => {
    const container = containerRef.current;
    const activeEl = activeItemRef.current;
    if (!container || !activeEl) return;

    // Only adjust if not already fully visible
    const containerTop = container.scrollTop;
    const containerBottom = containerTop + container.clientHeight;
    const elemTop = activeEl.offsetTop;
    const elemBottom = elemTop + activeEl.offsetHeight;

    if (elemTop < containerTop || elemBottom > containerBottom) {
      // Center the active item for better context
      try {
        activeEl.scrollIntoView({ block: "center", inline: "nearest" });
      } catch (e) {
        // Fallback for older browsers
        container.scrollTop = Math.max(0, elemTop - container.clientHeight / 2);
      }
    }
  }, [activeDashboardId, activeQueryId, dashboardItems.length, queryItems.length]);

  return (
    <aside ref={containerRef} className={`related-by-tag-sidebar ${className || ""}`.trim()}>
      <div className="rbts-header tiled">Related by Tag</div>
            {dashboardItems.length > 0 && (
        <Section title="Dashboards">
          <ul className="rbts-list">
            {dashboardItems.map(d => (
              <li
                key={`d-${d.id}`}
                ref={String(d.id) === String(activeDashboardId) ? activeItemRef : null}
                className={`rbts-item${String(d.id) === String(activeDashboardId) ? " active" : ""}`.trim()}>
                <Link href={urlForDashboard(d)} title={d.name}>
                  <i className="fa fa-th-large m-r-5" aria-hidden="true" />
                  <span className="rbts-item-text">{d.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
      {queryItems.length > 0 && (
        <Section title="Queries">
          <ul className="rbts-list">
            {queryItems.map(q => (
              <li
                key={`q-${q.id}`}
                ref={String(q.id) === String(activeQueryId) ? activeItemRef : null}
                className={`rbts-item${String(q.id) === String(activeQueryId) ? " active" : ""}`.trim()}>
                <Link href={`queries/${q.id}`} title={q.name}>
                  <i className="fa fa-code m-r-5" aria-hidden="true" />
                  <span className="rbts-item-text">{q.name}</span>
                </Link>
              </li>
            ))}
          </ul>
        </Section>
      )}
    </aside>
  );
}

RelatedByTagSidebar.propTypes = {
  tags: PropTypes.arrayOf(PropTypes.string),
  excludeDashboardId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  excludeQueryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  showDashboards: PropTypes.bool,
  showQueries: PropTypes.bool,
  activeDashboardId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  activeQueryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  fetchTagsFromDashboardId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  fetchTagsFromQueryId: PropTypes.oneOfType([PropTypes.string, PropTypes.number]),
  className: PropTypes.string,
};

RelatedByTagSidebar.defaultProps = {
  tags: [],
  excludeDashboardId: null,
  excludeQueryId: null,
  showDashboards: true,
  showQueries: true,
  activeDashboardId: null,
  activeQueryId: null,
  fetchTagsFromDashboardId: null,
  fetchTagsFromQueryId: null,
  className: null,
};










