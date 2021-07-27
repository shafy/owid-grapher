import React from "react"
import { observer } from "mobx-react"
import { Bounds, DEFAULT_BOUNDS } from "../../clientUtils/Bounds"
import { computed } from "mobx"
import {
    ChartTypeName,
    FacetAxisRange,
    FacetStrategy,
    ScaleType,
    SeriesStrategy,
} from "../core/GrapherConstants"
import {
    ChartComponentClassMap,
    DefaultChartClass,
} from "../chart/ChartTypeMap"
import { ChartManager } from "../chart/ChartManager"
import { ChartInterface } from "../chart/ChartInterface"
import { getChartPadding, getFontSize } from "./FacetChartUtils"
import {
    FacetSeries,
    FacetChartProps,
    PlacedFacetSeries,
} from "./FacetChartConstants"
import { OwidTable } from "../../coreTable/OwidTable"
import { autoDetectYColumnSlugs, makeSelectionArray } from "../chart/ChartUtils"
import { SelectionArray } from "../selection/SelectionArray"
import { CoreColumn } from "../../coreTable/CoreTableColumns"
import { extent } from "d3-array"
import { excludeUndefined, flatten, maxBy } from "../../clientUtils/Util"
import { AxisConfigInterface } from "../axis/AxisConfigInterface"
import { Position, PositionMap } from "../../clientUtils/owidTypes"
import { AxisConfig, FontSizeManager } from "../axis/AxisConfig"

const facetBackgroundColor = "transparent" // we don't use color yet but may use it for background later

const moveBottomToTop = (posMap: PositionMap<number>): PositionMap<number> => {
    if (posMap.bottom) {
        const { top, right, bottom, left } = posMap
        return {
            top: (top ?? 0) + bottom,
            right,
            left,
        }
    }
    return posMap
}

const getContentBounds = (
    containerBounds: Bounds,
    manager: ChartManager,
    chartInstance: ChartInterface
): Bounds => {
    let bounds = containerBounds
    const axes = [
        { config: manager.xAxisConfig, axis: chartInstance.xAxis },
        { config: manager.yAxisConfig, axis: chartInstance.yAxis },
    ]
    for (const { config, axis } of axes) {
        if (!config || !axis) continue
        if (!config.hideAxis && config.minSize !== undefined) {
            bounds = bounds.pad({ [axis.position]: config.minSize })
        }
    }
    return bounds
}

@observer
export class FacetChart
    extends React.Component<FacetChartProps>
    implements ChartInterface, FontSizeManager {
    transformTable(table: OwidTable): OwidTable {
        return table
    }

    @computed get inputTable(): OwidTable {
        return this.manager.table
    }

    @computed get transformedTable(): OwidTable {
        return (
            this.manager.transformedTable ??
            this.transformTable(this.inputTable)
        )
    }

    @computed get fontSize(): number {
        return getFontSize(this.series.length, this.manager.baseFontSize)
    }

    @computed private get yAxisConfig(): AxisConfig {
        return new AxisConfig(this.manager.yAxisConfig, this)
    }

    @computed private get uniformYAxis(): boolean {
        return this.yAxisConfig.facetAxisRange === FacetAxisRange.shared
    }

    @computed private get uniformXAxis(): boolean {
        return true
    }

    /**
     * Holds the intermediate render properties for chart views, before axes are synchronized,
     * collapsed, aligned, etc.
     *
     * An example: a StackedArea has a Y axis domain that is the largest sum of all columns.
     * In order to avoid replicating that logic here (stacking values), we initialize StackedArea
     * instances, without rendering them. In a later method, we use those intermediate chart views to
     * determine the final axes for facets, e.g. for a uniform axis, we would iterate through all
     * instances to find the full extent of the domain.
     *
     * @danielgavrilov, 2021-07-13
     */
    @computed private get intermediatePlacedSeries(): PlacedFacetSeries[] {
        const { manager, series } = this
        const count = series.length

        // Copy properties from manager to facets
        const baseFontSize = this.fontSize
        const lineStrokeWidth = count > 16 ? 1.5 : undefined
        const gridBoundsArr = this.bounds.grid(
            count,
            getChartPadding(count, baseFontSize)
        )
        const {
            yColumnSlug,
            xColumnSlug,
            yColumnSlugs,
            colorColumnSlug,
            sizeColumnSlug,
            isRelativeMode,
        } = manager

        // Use compact labels, e.g. 50k instead of 50,000.
        const compactLabels = count > 2
        const globalXAxisConfig: AxisConfigInterface = {
            compactLabels,
        }
        const globalYAxisConfig: AxisConfigInterface = {
            compactLabels,
        }

        // We infer that the user cares about the trend if the axis is not uniform
        // and the metrics on all facets are the same
        const careAboutTrend =
            !this.uniformYAxis && this.facetStrategy === FacetStrategy.entity
        if (careAboutTrend) {
            // Force disable nice axes if we care about the trend,
            // because nice axes misrepresent trends.
            globalYAxisConfig.nice = false

            const isLogScale =
                this.manager.yAxisConfig?.scaleType === ScaleType.log
            if (!isLogScale) globalYAxisConfig.maxTicks = 3
        }

        const table = this.transformedTable

        return series.map((series, index) => {
            const { bounds, edges } = gridBoundsArr[index]
            const chartTypeName =
                series.chartTypeName ??
                this.props.chartTypeName ??
                ChartTypeName.LineChart

            // TODO figure out how to do legends better
            const hideLegend = !edges.has(Position.right)
            const hidePoints = true

            // NOTE: The order of overrides is important!
            // We need to preserve most config coming in.
            const manager: ChartManager = {
                table,
                baseFontSize,
                lineStrokeWidth,
                hideLegend,
                hidePoints,
                yColumnSlug,
                xColumnSlug,
                yColumnSlugs,
                colorColumnSlug,
                sizeColumnSlug,
                isRelativeMode,
                ...series.manager,
                xAxisConfig: {
                    ...globalXAxisConfig,
                    ...this.manager.xAxisConfig,
                    ...series.manager.xAxisConfig,
                },
                yAxisConfig: {
                    ...globalYAxisConfig,
                    ...this.manager.yAxisConfig,
                    ...series.manager.yAxisConfig,
                },
            }
            return {
                bounds,
                contentBounds: bounds,
                chartTypeName,
                manager,
                seriesName: series.seriesName,
                color: series.color,
            }
        })
    }

    @computed private get placedSeries(): PlacedFacetSeries[] {
        // Create intermediate chart views to determine some of the properties
        const chartInstances = this.intermediatePlacedSeries.map(
            ({ bounds, manager, chartTypeName }) => {
                const ChartClass =
                    ChartComponentClassMap.get(chartTypeName) ??
                    DefaultChartClass
                return new ChartClass({ bounds, manager })
            }
        )
        const sharedAxesSizes: PositionMap<number> = {}
        const globalXAxisConfig: AxisConfigInterface = {}
        const globalYAxisConfig: AxisConfigInterface = {}
        // set the axis minSize
        const chartInstanceWithLargestXAxis = maxBy(
            chartInstances,
            (chartInstance) => chartInstance.xAxis?.size
        )
        if (chartInstanceWithLargestXAxis) {
            const { size } = chartInstanceWithLargestXAxis.xAxis!
            globalXAxisConfig.minSize = size
        }
        const chartInstanceWithLargestYAxis = maxBy(
            chartInstances,
            (chartInstance) => chartInstance.yAxis?.size
        )
        if (chartInstanceWithLargestYAxis) {
            const { size } = chartInstanceWithLargestYAxis.yAxis!
            globalYAxisConfig.minSize = size
        }
        // Uniform X axis
        if (this.uniformXAxis) {
            // set the domain
            const [min, max] = extent(
                excludeUndefined(
                    flatten(
                        chartInstances.map(
                            (chartInstance) => chartInstance.xAxis?.domain
                        )
                    )
                )
            )
            globalXAxisConfig.min = min
            globalXAxisConfig.max = max
            if (chartInstanceWithLargestXAxis) {
                const axis = chartInstanceWithLargestXAxis.xAxis!.clone()
                const { size } = axis.updateDomainPreservingUserSettings([
                    min,
                    max,
                ])
                sharedAxesSizes[axis.position] = size
                globalXAxisConfig.minSize = size
            }
        }

        // Uniform Y axis
        if (this.uniformYAxis) {
            const [min, max] = extent(
                excludeUndefined(
                    flatten(
                        chartInstances.map(
                            (chartInstance) => chartInstance.yAxis?.domain
                        )
                    )
                )
            )
            globalYAxisConfig.min = min
            globalYAxisConfig.max = max
            if (chartInstanceWithLargestYAxis) {
                const axis = chartInstanceWithLargestYAxis.yAxis!.clone()
                const { size } = axis.updateDomainPreservingUserSettings([
                    min,
                    max,
                ])
                sharedAxesSizes[axis.position] = size
                globalYAxisConfig.minSize = size
            }
        }
        // Allocate space for shared axes, so that the content areas of charts are all equal.
        // Shared axes mean axes are only plotted on the facets that match the edge the axis is on.
        // For example, a vertical Y axis would be plotted on the left-most charts only.
        // An exception is the bottom axis, which gets plotted on the top row of charts, instead of
        // the bottom row of charts.
        const sharedAxesPadding = moveBottomToTop(sharedAxesSizes)
        const fullBounds = this.bounds.pad(sharedAxesPadding)
        const count = this.intermediatePlacedSeries.length
        const gridBoundsArr = fullBounds.grid(
            count,
            getChartPadding(count, this.fontSize)
        )
        return this.intermediatePlacedSeries.map((series, i) => {
            const chartInstance = chartInstances[i]
            const { xAxis, yAxis } = chartInstance
            const { bounds: initialGridBounds, edges } = gridBoundsArr[i]
            let bounds = initialGridBounds
            for (const edge of edges) {
                bounds = bounds.expand({
                    [edge]: sharedAxesPadding[edge],
                })
            }
            // NOTE: The order of overrides is important!
            // We need to preserve most config coming in.
            const manager = {
                ...series.manager,
                xAxisConfig: {
                    ...series.manager.xAxisConfig,
                    ...globalXAxisConfig,
                    hideAxis:
                        xAxis &&
                        xAxis.position in sharedAxesSizes &&
                        !edges.has(
                            xAxis.position === Position.bottom
                                ? Position.top
                                : xAxis.position
                        ),
                },
                yAxisConfig: {
                    ...series.manager.yAxisConfig,
                    ...globalYAxisConfig,
                    hideAxis:
                        yAxis &&
                        yAxis.position in sharedAxesSizes &&
                        !edges.has(
                            yAxis.position === Position.bottom
                                ? Position.top
                                : yAxis.position
                        ),
                },
            }
            const contentBounds = getContentBounds(
                bounds,
                manager,
                chartInstance
            )
            return {
                ...series,
                bounds,
                contentBounds,
                manager,
            }
        })
    }

    @computed private get selectionArray(): SelectionArray {
        return makeSelectionArray(this.manager)
    }

    @computed private get countryFacets(): FacetSeries[] {
        const table = this.transformedTable.filterByEntityNames(
            this.selectionArray.selectedEntityNames
        )
        return this.selectionArray.selectedEntityNames.map((seriesName) => {
            const seriesTable = table.filterByEntityNames([seriesName])
            // Only set overrides for this facet strategy.
            // Default properties are set elsewhere.
            const manager: ChartManager = {
                table: seriesTable,
                selection: [seriesName],
                seriesStrategy: SeriesStrategy.column,
            }
            if (this.manager.yColumnSlugs?.length === 1) {
                manager.hideLegend = true
            }
            return {
                seriesName,
                color: facetBackgroundColor,
                manager,
            }
        })
    }

    @computed private get columnFacets(): FacetSeries[] {
        return this.yColumns.map((col) => {
            // Only set overrides for this facet strategy.
            // Default properties are set elsewhere.
            return {
                seriesName: col.displayName,
                color: facetBackgroundColor,
                manager: {
                    selection: this.selectionArray,
                    yColumnSlug: col.slug,
                    yColumnSlugs: [col.slug],
                    seriesStrategy: SeriesStrategy.entity,
                },
            }
        })
    }

    @computed private get yColumns(): CoreColumn[] {
        return this.yColumnSlugs.map((slug) => this.inputTable.get(slug))
    }

    @computed private get yColumnSlugs(): string[] {
        return autoDetectYColumnSlugs(this.manager)
    }

    @computed private get facetStrategy(): FacetStrategy {
        return this.manager.facetStrategy ?? FacetStrategy.none
    }

    @computed get series(): FacetSeries[] {
        return this.facetStrategy === FacetStrategy.column
            ? this.columnFacets
            : this.countryFacets
    }

    @computed protected get bounds(): Bounds {
        return (this.props.bounds ?? DEFAULT_BOUNDS).padTop(this.fontSize + 10)
    }

    @computed protected get manager(): ChartManager {
        return this.props.manager
    }

    @computed get failMessage(): string {
        return ""
    }

    render(): JSX.Element[] {
        const { fontSize } = this
        return this.placedSeries.map((smallChart, index: number) => {
            const ChartClass =
                ChartComponentClassMap.get(smallChart.chartTypeName) ??
                DefaultChartClass
            const { bounds, contentBounds, seriesName } = smallChart
            const shiftTop = fontSize * 0.9
            return (
                <React.Fragment key={index}>
                    <text
                        x={contentBounds.x}
                        y={contentBounds.top - shiftTop}
                        fill={"#1d3d63"}
                        fontSize={fontSize}
                        style={{ fontWeight: 700 }}
                    >
                        {seriesName}
                    </text>
                    <ChartClass bounds={bounds} manager={smallChart.manager} />
                </React.Fragment>
            )
        })
    }
}
