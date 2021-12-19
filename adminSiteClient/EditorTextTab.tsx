import * as React from "react"
import { action, observable } from "mobx"
import { observer } from "mobx-react"
import { ChartEditor } from "./ChartEditor"
import {
    Toggle,
    Section,
    BindString,
    BindAutoString,
    AutoTextField,
    RadioGroup,
    TextField,
    Button,
    SelectField,
    EditableList,
    EditableListItem,
} from "./Forms"
import { LogoOption } from "../grapher/captionedChart/Logos"
import slugify from "slugify"
import { RelatedQuestionsConfig, Topic } from "../grapher/core/GrapherConstants"
import {
    getErrorMessageRelatedQuestionUrl,
    Grapher,
} from "../grapher/core/Grapher" // fix.
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import { faPlus } from "@fortawesome/free-solid-svg-icons/faPlus"
import { faMinus } from "@fortawesome/free-solid-svg-icons/faMinus"
import { faTimes } from "@fortawesome/free-solid-svg-icons/faTimes"

@observer
export class EditorTextTab extends React.Component<{ editor: ChartEditor }> {
    @action.bound onSlug(slug: string) {
        this.props.editor.grapher.slug = slugify(slug).toLowerCase()
    }

    @action.bound onChangeLogo(value: string) {
        if (value === "none") {
            this.props.editor.grapher.hideLogo = true
        } else {
            this.props.editor.grapher.hideLogo = undefined
            this.props.editor.grapher.logo = (value as LogoOption) || undefined
        }
    }

    @action.bound onAddRelatedQuestion() {
        const { grapher } = this.props.editor
        grapher.relatedQuestions.push({
            text: "",
            url: "",
        })
    }

    @action.bound onRemoveRelatedQuestion(idx: number) {
        const { grapher } = this.props.editor
        grapher.relatedQuestions.splice(idx, 1)
    }

    render() {
        const { grapher, references } = this.props.editor
        const { relatedQuestions } = grapher

        return (
            <div className="EditorTextTab">
                <Section name="Header">
                    <BindAutoString
                        field="title"
                        store={grapher}
                        auto={grapher.displayTitle}
                        softCharacterLimit={100}
                    />
                    <Toggle
                        label="Hide automatic time/entity"
                        value={!!grapher.hideTitleAnnotation}
                        onValue={action(
                            (value: boolean) =>
                                (grapher.hideTitleAnnotation =
                                    value || undefined)
                        )}
                    />
                    <AutoTextField
                        label="/grapher"
                        value={grapher.displaySlug}
                        onValue={this.onSlug}
                        isAuto={grapher.slug === undefined}
                        onToggleAuto={() =>
                            (grapher.slug =
                                grapher.slug === undefined
                                    ? grapher.displaySlug
                                    : undefined)
                        }
                        helpText="Human-friendly URL for this chart"
                    />
                    <BindString
                        field="subtitle"
                        store={grapher}
                        placeholder="Briefly describe the context of the data. It's best to avoid duplicating any information which can be easily inferred from other visual elements of the chart."
                        textarea
                        softCharacterLimit={280}
                    />
                    <RadioGroup
                        label="Logo"
                        options={[
                            { label: "OWID", value: "owid" },
                            { label: "CORE+OWID", value: "core+owid" },
                            { label: "GV+OWID", value: "gv+owid" },
                            { label: "No logo", value: "none" },
                        ]}
                        value={
                            grapher.hideLogo ? "none" : grapher.logo || "owid"
                        }
                        onChange={this.onChangeLogo}
                    />
                </Section>
                <Section name="Footer">
                    <BindAutoString
                        label="Source"
                        field="sourceDesc"
                        store={grapher}
                        auto={grapher.sourcesLine}
                        helpText="Short comma-separated list of source names"
                        softCharacterLimit={60}
                    />
                    <BindString
                        label="Origin url"
                        field="originUrl"
                        store={grapher}
                        placeholder={grapher.originUrlWithProtocol}
                        helpText="The page containing this chart where more context can be found"
                    />
                    <TopicsSection grapher={grapher} />
                    {references && references.length > 0 && (
                        <div className="originSuggestions">
                            <p>Origin url suggestions</p>
                            <ul>
                                {references.map((post) => (
                                    <li key={post.id}>{post.url}</li>
                                ))}
                            </ul>
                        </div>
                    )}
                    <BindString
                        label="Footer note"
                        field="note"
                        store={grapher}
                        helpText="Any important clarification needed to avoid miscommunication"
                        softCharacterLimit={140}
                    />
                </Section>
                <Section name="Related">
                    {relatedQuestions.map(
                        (question: RelatedQuestionsConfig, idx: number) => (
                            <div key={idx}>
                                <TextField
                                    label="Related question"
                                    value={question.text}
                                    onValue={action((value: string) => {
                                        question.text = value
                                    })}
                                    placeholder="e.g. How did countries respond to the pandemic?"
                                    helpText="Short question promoting exploration of related content"
                                    softCharacterLimit={50}
                                />
                                {question.text && (
                                    <TextField
                                        label="URL"
                                        value={question.url}
                                        onValue={action((value: string) => {
                                            question.url = value
                                        })}
                                        placeholder="e.g. https://ourworldindata.org/coronavirus"
                                        helpText="Page or section of a page where the answer to the previous question can be found."
                                        errorMessage={getErrorMessageRelatedQuestionUrl(
                                            question
                                        )}
                                    />
                                )}
                                <Button
                                    onClick={() =>
                                        this.onRemoveRelatedQuestion(idx)
                                    }
                                >
                                    <FontAwesomeIcon icon={faMinus} /> Remove
                                    related question
                                </Button>
                            </div>
                        )
                    )}
                    {!relatedQuestions.length && (
                        <Button onClick={this.onAddRelatedQuestion}>
                            <FontAwesomeIcon icon={faPlus} /> Add related
                            question
                        </Button>
                    )}
                </Section>
                <Section name="Misc">
                    <BindString
                        label="Internal author notes"
                        field="internalNotes"
                        store={grapher}
                        placeholder="e.g. WIP, needs review, etc"
                        textarea
                    />
                    <BindString
                        label="Variant name"
                        field="variantName"
                        store={grapher}
                        placeholder="e.g. IHME data"
                        helpText="Optional variant name for distinguishing charts with the same title"
                    />
                </Section>
            </div>
        )
    }
}

type TopicName = string
@observer
class TopicsSection extends React.Component<{ grapher: Grapher }> {
    @observable.ref draggedTopic?: TopicName

    @action.bound onAddTopic(topic: Topic) {
        this.props.grapher.topics.push(topic)
    }

    @action.bound onRemoveTopic(topic: Topic) {
        const topicIdx = this.props.grapher.topics.findIndex((t) => t === topic)
        this.props.grapher.topics.splice(topicIdx, 1)
    }

    @action.bound onStartDrag(topic: TopicName) {
        this.draggedTopic = topic

        const onDrag = action(() => {
            this.draggedTopic = undefined
            window.removeEventListener("mouseup", onDrag)
        })

        window.addEventListener("mouseup", onDrag)
    }

    @action.bound onMouseEnter(topic: TopicName) {
        if (!this.draggedTopic || topic === this.draggedTopic) return

        const { topics } = this.props.grapher

        const dragIndex = topics.indexOf(this.draggedTopic)
        const targetIndex = topics.indexOf(topic)
        topics.splice(dragIndex, 1)
        topics.splice(targetIndex, 0, this.draggedTopic)
    }

    render() {
        const { grapher } = this.props

        const allTopics = ["1", "2", "3"]

        return (
            <>
                <h5>Topics</h5>
                <SelectField
                    onValue={this.onAddTopic}
                    value="Select data"
                    options={["Select data"].concat(allTopics)}
                    optionLabels={["Select data"].concat(allTopics)}
                />
                <EditableList>
                    {grapher.topics.map((topicName) => (
                        <EditableListItem
                            key={topicName}
                            onMouseDown={() => this.onStartDrag(topicName)}
                            onMouseEnter={() => this.onMouseEnter(topicName)}
                            className="EditableListItem"
                        >
                            <div>{topicName}</div>
                            <div
                                className="clickable"
                                onClick={() => this.onRemoveTopic(topicName)}
                            >
                                <FontAwesomeIcon icon={faTimes} />
                            </div>
                        </EditableListItem>
                    ))}
                </EditableList>
            </>
        )
    }
}
