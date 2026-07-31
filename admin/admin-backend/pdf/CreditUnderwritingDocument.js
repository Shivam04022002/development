// pdf/CreditUnderwritingDocument.js
//
// Composes the single-page Credit Underwriting Decision Report from a
// display-ready context. Receives no MongoDB documents and no raw bureau JSON.

import React from "react";
import { Document, Page } from "@react-pdf/renderer";
import Header from "./Header.js";
import CreditNoteTable from "./CreditNoteTable.js";
import Footer from "./Footer.js";
import { styles } from "./styles.js";

const h = React.createElement;

export default function CreditUnderwritingDocument({ context, logo }) {
  return h(
    Document,
    { title: context.title, author: context.companyName },
    h(
      Page,
      { size: "A4", style: styles.page },
      h(Header, { context, logo }),
      h(CreditNoteTable, { rows: context.rows }),
      h(Footer, { context })
    )
  );
}
