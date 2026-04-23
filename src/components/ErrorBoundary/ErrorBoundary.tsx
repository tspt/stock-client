/**
 * 错误边界组件
 * 捕获子组件树中的 JavaScript 错误，并显示备用 UI
 */

import { Component, type ErrorInfo, type ReactNode } from 'react';
import { Result, Button } from 'antd';
import { logger } from '@/utils/business/logger';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    return {
      hasError: true,
      error,
    };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    logger.error('ErrorBoundary caught an error:', error, errorInfo);

    // 可以在这里上报错误到监控系统
    // reportError(error, errorInfo);
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // 如果提供了自定义 fallback，使用它
      if (this.props.fallback) {
        return this.props.fallback;
      }

      // 默认错误 UI
      return (
        <Result
          status="error"
          title="出现了一些问题"
          subTitle={this.state.error?.message || '组件渲染出错'}
          extra={[
            <Button type="primary" key="retry" onClick={this.handleReset}>
              重试
            </Button>,
          ]}
        />
      );
    }

    return this.props.children;
  }
}
