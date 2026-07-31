// pdf/Header.js — centred letterhead: logo, company name, tagline, address,
// orange divider, title, orange divider. Presentation only.
//
// Written with React.createElement rather than JSX because the admin backend
// runs plain Node ESM with no JSX transform; adding one would mean extra
// build tooling for no functional gain.

import React from "react";
import { View, Text, Image } from "@react-pdf/renderer";
import { styles } from "./styles.js";

const h = React.createElement;

export default function Header({ context, logo }) {
  return h(
    View,
    null,
    h(
      View,
      { style: styles.header },
      logo ? h(Image, { style: styles.logo, src: logo }) : null,
      h(Text, { style: styles.companyName }, context.companyName),
      h(Text, { style: styles.tagline }, context.tagline),
      h(Text, { style: styles.address }, context.address)
    ),
    h(View, { style: styles.divider }),
    h(Text, { style: styles.title }, context.title),
    h(View, { style: styles.divider })
  );
}
