// pdf/Footer.js
//
// The reference document has no footer band, so this renders nothing by
// default and exists as the seam for one. Passing `show` draws a minimal
// generated-on line without disturbing the reference layout.

import React from "react";
import { View, Text } from "@react-pdf/renderer";
import { COLORS } from "./styles.js";

const h = React.createElement;

export default function Footer({ context, show = false }) {
  if (!show) return null;
  return h(
    View,
    { style: { position: "absolute", bottom: 24, left: 45, right: 45 }, fixed: true },
    h(
      Text,
      { style: { fontSize: 7.5, color: COLORS.greyText, textAlign: "center" } },
      `${context.companyName} - ${context.address}`
    )
  );
}
