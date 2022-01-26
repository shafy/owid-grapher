import {
    InnerBlocks,
    RichText,
    URLInput,
    InspectorControls,
} from "@wordpress/block-editor"
import { createBlock } from "@wordpress/blocks"
import { Panel, PanelBody, PanelRow } from "@wordpress/components"
import MediaContainer from "../MediaContainer/MediaContainer"

const linkColor = "#2271b1"
const blockStyle = {
    border: `1px dashed ${linkColor}`,
    padding: "0.5rem",
}

const parser = new DOMParser()

const isLink = (text) => {
    return /^https?:\/\/[\S]+$/.test(text)
}

const isInternalLink = (text) => {
    const BAKED_BASE_URL_REGEX = /^https?:\/\/ourworldindata\.org/
    return BAKED_BASE_URL_REGEX.test(text)
}

const isAnchorNode = (node) => {
    return node?.nodeName === "A"
}

const isTextNode = (node) => {
    return node?.nodeName === "#text"
}

const isInternalLinkNode = (node) => {
    return (
        (isAnchorNode(node) && isInternalLink(node.getAttribute("href"))) ||
        (isTextNode(node) && isInternalLink(node.textContent))
    )
}

export const getProminentLinkInfo = (node) => {
    if (!node) return {}

    const textContent = node.textContent

    const url = isAnchorNode(node)
        ? node.getAttribute("href")
        : isLink(textContent)
        ? textContent
        : ""

    const title = textContent !== url ? textContent : ""

    return { title, url }
}

const getProminentLinkBlock = (node) => {
    const { title, url: linkUrl, content } = getProminentLinkInfo(node)
    const blockContent = []

    if (content)
        blockContent.push(
            createBlock("core/paragraph", {
                content,
            })
        )

    return createBlock(
        "owid/prominent-link",
        {
            title,
            linkUrl,
        },
        blockContent
    )
}

const ProminentLink = {
    title: "Prominent link",
    icon: "admin-links",
    category: "formatting",
    supports: {
        html: false,
    },
    attributes: {
        title: {
            type: "string",
        },
        linkUrl: {
            type: "string",
        },
        mediaId: {
            type: "integer",
        },
        mediaUrl: {
            type: "string",
        },
        mediaAlt: {
            type: "string",
        },
    },
    transforms: {
        from: [
            {
                type: "block",
                blocks: ["core/paragraph"],
                transform: ({ content }) => {
                    const node = parser
                        .parseFromString(content, "text/html")
                        .querySelector("body").childNodes[0]

                    return getProminentLinkBlock(node)
                },
            },
            {
                type: "raw",
                isMatch: (node) => {
                    return (
                        node?.nodeName === "P" &&
                        node.hasChildNodes() &&
                        node.childNodes.length === 1 &&
                        isInternalLinkNode(node.firstChild)
                    )
                },
                transform: (paragraphNode) => {
                    return getProminentLinkBlock(paragraphNode.firstChild)
                },
            },
        ],
    },
    edit: ({
        attributes: { title, linkUrl, mediaId, mediaUrl, mediaAlt },
        setAttributes,
    }) => {
        return (
            <>
                <InspectorControls>
                    <PanelBody title="Link" initialOpen={true}>
                        <PanelRow>
                            <URLInput
                                label="URL"
                                value={linkUrl}
                                onChange={(linkUrl, post) =>
                                    setAttributes({ linkUrl })
                                }
                            />
                        </PanelRow>
                        <PanelRow>
                            <MediaContainer
                                onSelectMedia={(media) => {
                                    // Try the "large" size URL, falling back to the "full" size URL below.
                                    // const src = get( media, [ 'sizes', 'large', 'url' ] ) || get( media, [ 'media_details', 'sizes', 'large', 'source_url' ] );
                                    setAttributes({
                                        mediaId: media.id,
                                        // mediaUrl: src || media.url,
                                        mediaUrl: media.url,
                                        mediaAlt: media.alt,
                                    })
                                }}
                                mediaId={mediaId}
                                mediaUrl={mediaUrl}
                                mediaAlt={mediaAlt}
                            />
                        </PanelRow>
                    </PanelBody>
                </InspectorControls>
                <div style={blockStyle}>
                    <RichText
                        tagName="h5"
                        value={title}
                        onChange={(newTitle) => {
                            setAttributes({ title: newTitle })
                        }}
                        placeholder={`Override title for ${linkUrl}`}
                        style={{
                            marginTop: 0,
                            marginBottom: 0,
                            color: isLink(linkUrl) ? linkColor : "red",
                            fontWeight: "normal",
                        }}
                    />
                    <div>
                        <InnerBlocks />
                    </div>
                </div>
            </>
        )
    },
    save: (props) => {
        return <InnerBlocks.Content />
    },
}

export default ProminentLink
