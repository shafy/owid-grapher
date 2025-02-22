import React from "react"
import { Head } from "./Head.js"
import { SiteHeader } from "./SiteHeader.js"
import { SiteFooter } from "./SiteFooter.js"
import { VariableCountryPageProps } from "./VariableCountryPageProps.js"

export const VariableCountryPage = (props: VariableCountryPageProps) => {
    const { variable, country, baseUrl } = props

    const pageTitle = `${country.name} / ${variable.name}`
    const script = `window.runVariableCountryPage(${JSON.stringify(props)})`

    return (
        <html>
            <Head
                canonicalUrl={`${baseUrl}/search`}
                pageTitle={pageTitle}
                pageDesc="Search articles and charts on Our World in Data."
                baseUrl={baseUrl}
            />
            <body className="VariableCountryPage">
                <SiteHeader baseUrl={baseUrl} />
                <main>{variable.name}</main>
                <SiteFooter baseUrl={baseUrl} />
                <script dangerouslySetInnerHTML={{ __html: script }} />
            </body>
        </html>
    )
}
