// pdf/CreditNoteTable.js — the single two-column table. Rows come pre-built and
// pre-formatted from templateContext.js; this only lays them out.

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { styles } from "./styles.js";

const h = React.createElement;

export default function CreditNoteTable({ rows }) {
  return h(
    View,
    { style: styles.table },
    (rows || []).map((row, i) =>
      h(
        View,
        { style: styles.row, key: `${i}-${row.label}`, wrap: false },
        h(View, { style: styles.labelCell }, h(Text, { style: styles.labelText }, row.label)),
        h(
          View,
          { style: styles.valueCell },
          h(
            Text,
            { style: row.accent ? [styles.valueText, styles.valueAccent] : styles.valueText },
            row.value
          )
        )
      )
    )
  );
}
