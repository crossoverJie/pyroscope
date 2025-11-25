import React, { useEffect, useState } from 'react';
import 'react-dom';

import { useAppDispatch, useAppSelector } from '@pyroscope/redux/hooks';
import {
  fetchSingleView,
  setQuery,
  selectQueries,
  setDateRange,
  actions,
  fetchTagValues,
} from '@pyroscope/redux/reducers/continuous';
import useColorMode from '@pyroscope/hooks/colorMode.hook';
import TimelineChartWrapper from '@pyroscope/components/TimelineChart/TimelineChartWrapper';
import Toolbar from '@pyroscope/components/Toolbar';
import ChartTitle from '@pyroscope/components/ChartTitle';
import TagsBar from '@pyroscope/components/TagsBar';
import useTimeZone from '@pyroscope/hooks/timeZone.hook';
import PageTitle from '@pyroscope/components/PageTitle';
import { getFormatter } from '@pyroscope/legacy/flamegraph/format/format';
import { TooltipCallbackProps } from '@pyroscope/components/TimelineChart/Tooltip.plugin';
import { Profile } from '@pyroscope/legacy/models';
import useTags from '@pyroscope/hooks/tags.hook';
import {
  TimelineTooltip,
  TimelineTooltipProps,
} from '@pyroscope/components/TimelineTooltip';
import { formatTitle } from './formatTitle';
import { isLoadingOrReloading } from './loading';
import { Panel } from '@pyroscope/components/Panel';
import { PageContentWrapper } from '@pyroscope/pages/PageContentWrapper';
import { FlameGraphWrapper } from '@pyroscope/components/FlameGraphWrapper';
import styles from './ContinuousSingleView.module.css';

type ContinuousSingleViewProps = {
  extraButton?: React.ReactNode;
  extraPanel?: React.ReactNode;
};

function ContinuousSingleView({
                                extraButton,
                                extraPanel,
                              }: ContinuousSingleViewProps) {
  const dispatch = useAppDispatch();
  const { offset } = useTimeZone();
  const { colorMode } = useColorMode();

  const { query } = useAppSelector(selectQueries);
  const tags = useTags().regularTags;
  const { from, until, refreshToken, maxNodes } = useAppSelector(
      (state) => state.continuous
  );

  const { singleView } = useAppSelector((state) => state.continuous);

  // SpanID local input and executed value (used when Execute/Refresh is clicked)
  const [spanIdInput, setSpanIdInput] = useState('');
  // const [executedSpanId, setExecutedSpanId] = useState<string | null>(null);

    useEffect(() => {
        if (from && until && query && maxNodes) {
            // use current input directly; when user clicks Execute the refresh token will change
            // and this effect will run with the latest spanIdInput value
            const payload = spanIdInput ? { spanId: spanIdInput } : null;
            // cast to any to avoid the TS mismatch until the fetchSingleView typing is adjusted
            const fetchData = dispatch(fetchSingleView({spanId: spanIdInput}));
            return () => fetchData.abort('cancel');
        }
        return undefined;
    }, [from, until, query, refreshToken, maxNodes, dispatch, spanIdInput]);

  const flamegraphRenderer = (() => {
    switch (singleView.type) {
      case 'loaded':
      case 'reloading': {
        return <FlameGraphWrapper profile={singleView.profile} />;
      }

      default: {
        return 'Loading';
      }
    }
  })();

  const getTimeline = () => {
    switch (singleView.type) {
      case 'loaded':
      case 'reloading': {
        return {
          data: singleView.timeline,
          color: colorMode === 'light' ? '#3b78e7' : undefined,
        };
      }

      default: {
        return {
          data: undefined,
        };
      }
    }
  };

  return (
      <div>
        <PageTitle title={formatTitle('Single', query)} />
        <PageContentWrapper>
          <Toolbar
              onSelectedApp={(query) => {
                dispatch(setQuery(query));
              }}
          />
          {/* TagsBar + SpanID input placed side-by-side */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <TagsBar
                query={query}
                tags={tags}
                onRefresh={() => {
                  // capture current input as the executed span id, then trigger refresh
                  dispatch(actions.refresh());
                }}
                onSetQuery={(q) => dispatch(actions.setQuery(q))}
                onSelectedLabel={(label, query) => {
                  dispatch(fetchTagValues({ query, label }));
                }}
            />
            <input
                type="text"
                value={spanIdInput}
                onChange={(e) => setSpanIdInput(e.target.value)}
                placeholder="SpanID"
                data-testid="spanid-input"
                style={{
                  padding: '6px 8px',
                  borderRadius: 4,
                  border: '1px solid #ccc',
                  minWidth: 200,
                  fontSize: 13,
                }}
            />
          </div>

          <Panel
              isLoading={isLoadingOrReloading([singleView.type])}
              title={
                <ChartTitle
                    className="singleView-timeline-title"
                    titleKey={singleView?.profile?.metadata.name as any}
                />
              }
          >
            <TimelineChartWrapper
                timezone={offset === 0 ? 'utc' : 'browser'}
                data-testid="timeline-single"
                id="timeline-chart-single"
                timelineA={getTimeline()}
                onSelect={(from, until) => dispatch(setDateRange({ from, until }))}
                height="125px"
                selectionType="single"
                onHoverDisplayTooltip={(data) =>
                    createTooltip(query, data, singleView.profile)
                }
            />
          </Panel>
          <Panel
              isLoading={isLoadingOrReloading([singleView.type])}
              headerActions={extraButton}
          >
            {extraPanel ? (
                <div className={styles.flamegraphContainer}>
                  <div className={styles.flamegraphComponent}>
                    {flamegraphRenderer}
                  </div>
                  <div className={styles.extraPanel}>{extraPanel}</div>
                </div>
            ) : (
                flamegraphRenderer
            )}
          </Panel>
        </PageContentWrapper>
      </div>
  );
}

function createTooltip(
    query: string,
    data: TooltipCallbackProps,
    profile?: Profile
) {
  if (!profile) {
    return null;
  }

  const values = prepareTimelineTooltipContent(profile, query, data);

  if (values.length <= 0) {
    return null;
  }

  return <TimelineTooltip timeLabel={data.timeLabel} items={values} />;
}

// Converts data from TimelineChartWrapper into TimelineTooltip
function prepareTimelineTooltipContent(
    profile: Profile,
    query: string,
    data: TooltipCallbackProps
): TimelineTooltipProps['items'] {
  const formatter = getFormatter(
      profile.flamebearer.numTicks,
      profile.metadata.sampleRate,
      profile.metadata.units
  );

  // Filter non empty values
  return (
      data.values
          .map((a) => {
            return {
              label: query,
              // TODO: horrible API
              value: a?.closest?.[1],
            };
          })
          // Sometimes closest is null
          .filter((a) => {
            return a.value;
          })
          .map((a) => {
            return {
              ...a,
              value: formatter.format(a.value, profile.metadata.sampleRate, true),
            };
          })
  );
}

export default ContinuousSingleView;
