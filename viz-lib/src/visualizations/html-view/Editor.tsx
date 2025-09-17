import { map, merge } from "lodash";
import React from "react";
import { Section, Select } from "@/components/visualizations/editor";
import { EditorPropTypes } from "@/visualizations/prop-types";

export default function Editor({ options, data, onOptionsChange }: any) {
  const optionsChanged = (newOptions: any) => {
    onOptionsChange(merge({}, options, newOptions));
  };

  return (
    <React.Fragment>
      {/* @ts-expect-error ts-migrate(2745) FIXME: This JSX tag's 'children' prop expects type 'never... Remove this comment to see the full error message */}
      <Section>
        <Select
          label="HTML Column"
          data-test="HtmlView.Column"
          value={options.column || undefined}
          allowClear
          placeholder="Select column"
          onChange={(column: any) => optionsChanged({ column: column || null })}>
          {map(data.columns, ({ name }) => (
            // @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message
            <Select.Option key={name} value={name} data-test={"HtmlView.Column." + name}>
              {name}
              {/* @ts-expect-error ts-migrate(2339) FIXME: Property 'Option' does not exist on type '({ class... Remove this comment to see the full error message */}
            </Select.Option>
          ))}
        </Select>
      </Section>
    </React.Fragment>
  );
}

Editor.propTypes = EditorPropTypes;
