import { map, includes, difference } from "lodash";
import React, { useState, useCallback, useEffect } from "react";
import Badge from "antd/lib/badge";
import Menu from "antd/lib/menu";
import CloseOutlinedIcon from "@ant-design/icons/CloseOutlined";
import getTags from "@/services/getTags";
import PlainButton from "@/components/PlainButton";

import "./TagsList.less";

type Tag = {
  name: string;
  count?: number;
};

type TagsListProps = {
  tagsUrl: string;
  showUnselectAll: boolean;
  onUpdate?: (selectedTags: string[]) => void;
  // 현재 선택된 태그를 외부에서 제어(뒤로가기 복원 등)
  selected?: string[];
};

function TagsList({ tagsUrl, showUnselectAll = false, onUpdate, selected = [] }: TagsListProps): JSX.Element | null {
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTags, setSelectedTags] = useState<string[]>(selected || []);

  const compareByLanguageThenAlpha = useCallback((aName: string, bName: string) => {
    const a = String(aName || "").trim();
    const b = String(bName || "").trim();
    const aCh = a.charAt(0);
    const bCh = b.charAt(0);

    const isAsciiLetter = (ch: string) => /[A-Za-z]/.test(ch);
    const isHangul = (ch: string) => {
      if (!ch) return false;
      const code = ch.charCodeAt(0);
      return (
        (code >= 0xac00 && code <= 0xd7a3) || // Hangul Syllables
        (code >= 0x1100 && code <= 0x11ff) || // Hangul Jamo
        (code >= 0x3130 && code <= 0x318f) // Hangul Compatibility Jamo
      );
    };

    const group = (ch: string) => (isAsciiLetter(ch) ? 0 : isHangul(ch) ? 1 : 2);
    const gA = group(aCh);
    const gB = group(bCh);
    if (gA !== gB) return gA - gB; // English (0) first, then Hangul (1), then others (2)

    // Within group, sort alphabetically (case-insensitive). Use locale for Korean.
    const locale = gA === 1 ? "ko" : "en";
    return a.localeCompare(b, locale, { sensitivity: "base" });
  }, []);

  useEffect(() => {
    let isCancelled = false;

    getTags(tagsUrl).then(tags => {
      if (!isCancelled) {
        const sorted = [...tags].sort((a, b) => compareByLanguageThenAlpha(a.name, b.name));
        setAllTags(sorted);
      }
    });

    return () => {
      isCancelled = true;
    };
  }, [tagsUrl]);

  // 외부(selected) 변경 시 내부 상태 동기화
  useEffect(() => {
    setSelectedTags(selected || []);
  }, [selected]);

  const toggleTag = useCallback(
    (event, tag) => {
      let newSelectedTags;
      if (event.shiftKey) {
        // toggle tag
        if (includes(selectedTags, tag)) {
          newSelectedTags = difference(selectedTags, [tag]);
        } else {
          newSelectedTags = [...selectedTags, tag];
        }
      } else {
        // if the tag is the only selected, deselect it, otherwise select only it
        if (includes(selectedTags, tag) && selectedTags.length === 1) {
          newSelectedTags = [];
        } else {
          newSelectedTags = [tag];
        }
      }

      setSelectedTags(newSelectedTags);
      if (onUpdate) {
        onUpdate([...newSelectedTags]);
      }
    },
    [selectedTags, onUpdate]
  );

  const unselectAll = useCallback(() => {
    setSelectedTags([]);
    if (onUpdate) {
      onUpdate([]);
    }
  }, [onUpdate]);

  if (allTags.length === 0) {
    return null;
  }

  return (
    <div className="tags-list">
      <div className="tags-list-title">
        <span className="tags-list-label">Tags</span>
        {showUnselectAll && selectedTags.length > 0 && (
          <PlainButton type="link" onClick={unselectAll}>
            <CloseOutlinedIcon />
            clear selection
          </PlainButton>
        )}
      </div>

      <div className="tiled">
        <Menu className="invert-stripe-position" mode="inline" selectedKeys={selectedTags}>
          {map(allTags, tag => (
            <Menu.Item key={tag.name} className="m-0">
              <PlainButton
                className="d-flex align-items-center justify-content-between"
                onClick={event => toggleTag(event, tag.name)}>
                <span className="max-character col-xs-11">{tag.name}</span>
                <Badge count={tag.count} />
              </PlainButton>
            </Menu.Item>
          ))}
        </Menu>
      </div>
    </div>
  );
}

export default TagsList;
