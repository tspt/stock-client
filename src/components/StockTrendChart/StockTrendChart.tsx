/**
 * 股票上榜趋势图组件
 */

import { useEffect, useRef } from 'react';
import * as echarts from 'echarts';
import type { EChartsOption } from 'echarts';
import { DatePicker } from 'antd';

const { RangePicker } = DatePicker;

interface StockTrendChartProps {
  data: Array<{ date: string; count: number }>;
  onDateRangeChange?: (dates: [string, string] | null) => void;
}

export const StockTrendChart: React.FC<StockTrendChartProps> = ({ data, onDateRangeChange }) => {
  const chartRef = useRef<HTMLDivElement>(null);
  const chartInstance = useRef<echarts.ECharts | null>(null);

  // 初始化图表
  useEffect(() => {
    if (!chartRef.current) return;

    // 销毁旧实例
    if (chartInstance.current) {
      chartInstance.current.dispose();
    }

    // 创建新实例
    chartInstance.current = echarts.init(chartRef.current);

    return () => {
      if (chartInstance.current) {
        chartInstance.current.dispose();
      }
    };
  }, []);

  // 更新图表数据
  useEffect(() => {
    if (!chartInstance.current || data.length === 0) return;

    const dates = data.map(item => item.date);
    const counts = data.map(item => item.count);

    const option: EChartsOption = {
      tooltip: {
        trigger: 'axis',
        formatter: (params) => {
          if (Array.isArray(params) && params.length > 0) {
            const param = params[0] as any;
            return `${param.axisValue}<br />上榜股票数: ${param.value}`;
          }
          return '';
        }
      },
      xAxis: {
        type: 'category',
        data: dates,
        axisLabel: {
          rotate: 45,
          fontSize: 10,
        },
      },
      yAxis: {
        type: 'value',
        name: '股票数量',
      },
      series: [
        {
          data: counts,
          type: 'line',
          smooth: true,
          areaStyle: {
            opacity: 0.2,
          },
          lineStyle: {
            width: 2,
          },
          emphasis: {
            focus: 'series',
          },
          itemStyle: {
            color: '#1890ff',
          },
        },
      ],
      grid: {
        left: '3%',
        right: '4%',
        bottom: '15%',
        top: '5%',
        containLabel: true,
      },
    };

    chartInstance.current.setOption(option);
  }, [data]);

  // 响应窗口大小变化
  useEffect(() => {
    const handleResize = () => {
      if (chartInstance.current) {
        chartInstance.current.resize();
      }
    };

    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  return (
    <div className="trend-chart-container">
      <div style={{ marginBottom: 16 }}>
        <RangePicker
          placeholder={['开始日期', '结束日期']}
          onChange={(dates, dateString) => {
            if (dates && dateString[0] && dateString[1]) {
              onDateRangeChange?.([dateString[0], dateString[1]]);
            } else {
              onDateRangeChange?.(null);
            }
          }}
          style={{ width: '100%' }}
        />
      </div>
      <div ref={chartRef} style={{ width: '100%', height: '300px' }} />
    </div>
  );
};